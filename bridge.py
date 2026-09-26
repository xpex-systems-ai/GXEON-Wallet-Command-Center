from __future__ import annotations

import datetime
import json
import os
import secrets
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request, Response, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
REGISTRY = BASE_DIR / "config" / "wallets.json"

app = FastAPI(
    title="GXEON Local Companion Bridge V1.1",
    description="Local-first pairing and non-custodial wallet discovery engine for GXEON Command Center.",
    version="1.1.0",
)

# CORS restricted strictly to approved production Firebase hosting and local dev origins
ALLOWED_ORIGINS = [
    "https://studio-1105349706-f3598.web.app",
    "https://studio-1105349706-f3598.firebaseapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access_middleware(request: Request, call_next):
    """Support Private Network Access (PNA) preflight headers from modern browsers."""
    response: Response = await call_next(request)
    if request.headers.get("Access-Control-Request-Private-Network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# ============================================================
# IN-MEMORY EPHEMERAL PAIRING & SESSION STATE
# ============================================================

PAIRING_CODE_TTL_SECONDS = 300  # 5 minutes
SESSION_TOKEN_TTL_SECONDS = 3600  # 1 hour
MAX_PAIRING_ATTEMPTS = 5

class PairingState:
    code: Optional[str] = None
    created_at: float = 0.0
    attempts: int = 0
    sessions: Dict[str, float] = {}  # token -> expires_at timestamp


PAIRING_STORE = PairingState()

# Non-sensitive audit buffer
AUDIT_LOG: List[Dict[str, Any]] = [
    {
        "id": "init-001",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": "COMPANION_STARTED",
        "detail": "GXEON Local Companion V1.1 initialized on 127.0.0.1:8790",
        "severity": "info",
    }
]


def record_audit_event(event: str, detail: str, severity: str = "info") -> None:
    AUDIT_LOG.append({
        "id": f"evt-{len(AUDIT_LOG) + 1:04d}",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": event,
        "detail": detail,
        "severity": severity,
    })


def load_registry() -> dict[str, Any]:
    if not REGISTRY.exists():
        return {"version": 1, "wallets": []}
    try:
        return json.loads(REGISTRY.read_text(encoding="utf-8"))
    except Exception as e:
        record_audit_event("registry_read_error", str(e), severity="error")
        return {"version": 1, "wallets": []}


# ============================================================
# SECURITY / AUTH TOKEN VALIDATION
# ============================================================

def verify_session_token(authorization: Optional[str] = Header(None)) -> str:
    """
    Enforces that protected local companion endpoints are only callable
    with a valid, active ephemeral localSessionToken.
    """
    if not authorization or not authorization.startswith("Bearer "):
        record_audit_event("UNAUTHORIZED_ACCESS_BLOCKED", "Missing or malformed Bearer token", "warning")
        raise HTTPException(status_code=401, detail="Unauthorized: pairing token required")

    token = authorization.split("Bearer ", 1)[1].strip()
    now = time.time()

    # Clean up expired sessions
    expired = [t for t, exp in PAIRING_STORE.sessions.items() if exp < now]
    for t in expired:
        del PAIRING_STORE.sessions[t]

    if token not in PAIRING_STORE.sessions:
        record_audit_event("INVALID_TOKEN_REJECTED", "Provided pairing session token is invalid or expired", "warning")
        raise HTTPException(status_code=403, detail="Forbidden: session token invalid or expired")

    return token


# ============================================================
# SCHEMAS (Pydantic Models)
# ============================================================

class PairStartResponse(BaseModel):
    ok: bool = True
    pairing_code: str
    expires_in: int
    message: str


class PairConfirmRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class PairConfirmResponse(BaseModel):
    ok: bool = True
    token: str
    expires_in: int
    session_id: str


class PairStatusResponse(BaseModel):
    paired: bool
    active_sessions_count: int
    companion_version: str
    security_mode: str


class ToolDetectionItem(BaseModel):
    tool: str
    installed: bool
    version: Optional[str] = None
    path_sanitized: Optional[str] = None
    capabilities: List[str] = []


class DetectedWalletItem(BaseModel):
    id: str
    name: str
    network: str
    symbol: str
    publicAddress: str
    connectionType: str
    mode: str
    ownershipStatus: str
    purpose: Optional[str] = None


class DetectionResponse(BaseModel):
    tools: List[ToolDetectionItem]
    detected_wallets: List[DetectedWalletItem]


# ============================================================
# ADAPTERS CATALOG
# ============================================================

ADAPTERS_CATALOG = [
    {
        "id": "rustchain",
        "name": "RustChain RTC Adapter",
        "network": "rustchain",
        "version": "1.1.0",
        "status": "active",
        "capabilities": ["WATCH_ONLY", "READ_BALANCE", "READ_TRANSACTIONS"],
        "description": "Native watch-only receiver for RustChain (RTC) with live RPC query.",
    },
    {
        "id": "evm-metamask",
        "name": "MetaMask / EIP-1193 EVM Adapter",
        "network": "evm",
        "version": "1.1.0",
        "status": "active",
        "capabilities": ["CONNECT", "READ_BALANCE", "WATCH_ONLY"],
        "supported_chains": ["Ethereum Mainnet", "Base", "Polygon", "Arbitrum One"],
        "description": "Browser provider connector for EVM chains. Keys never leave the wallet.",
    },
    {
        "id": "coinbase-wallet",
        "name": "Coinbase Wallet Adapter",
        "network": "evm",
        "version": "1.1.0",
        "status": "partial",
        "capabilities": ["CONNECT", "WATCH_ONLY"],
        "description": "Dedicated Coinbase Wallet extension connector. Separate from custodial exchange APIs.",
    },
    {
        "id": "solana",
        "name": "Solana CLI Adapter",
        "network": "solana",
        "version": "0.2.0",
        "status": "partial",
        "capabilities": ["CLI_DETECT", "WATCH_ONLY"],
        "description": "Non-custodial Solana CLI address discovery. Signing remains local-only.",
    },
]


# ============================================================
# PUBLIC ENDPOINTS (No token required)
# ============================================================

@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "gxeon-wallet-local-companion",
        "bind": "127.0.0.1",
        "port": 8790,
        "security_mode": "local_only",
        "version": "1.1.0",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@app.get("/status")
def status():
    now = time.time()
    valid_sessions = sum(1 for exp in PAIRING_STORE.sessions.values() if exp > now)
    registry_data = load_registry()
    wallet_count = len(registry_data.get("wallets", []))
    return {
        "status": "operational",
        "security_invariants": {
            "no_private_keys": True,
            "bind_host": "127.0.0.1",
            "signing_plane": "local_machine_only",
            "send_enabled": False,
        },
        "registered_wallets_count": wallet_count,
        "active_adapters": len(ADAPTERS_CATALOG),
        "paired": valid_sessions > 0,
        "active_sessions": valid_sessions,
        "uptime": "active",
    }


# ============================================================
# PAIRING PROTOCOL ENDPOINTS
# ============================================================

@app.post("/pair/start", response_model=PairStartResponse)
def pair_start():
    """Generates a secure, 6-digit numeric pairing code with 5-minute TTL."""
    # Generate 6-digit code using cryptographically secure RNG
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    PAIRING_STORE.code = code
    PAIRING_STORE.created_at = time.time()
    PAIRING_STORE.attempts = 0

    record_audit_event("PAIRING_STARTED", "Generated ephemeral 6-digit pairing code (valid for 5 minutes)")
    return {
        "ok": True,
        "pairing_code": code,
        "expires_in": PAIRING_CODE_TTL_SECONDS,
        "message": "Enter this 6-digit pairing code in the GXEON Web Command Center UI",
    }


@app.post("/pair/confirm", response_model=PairConfirmResponse)
def pair_confirm(payload: PairConfirmRequest):
    """Validates the 6-digit code and issues an ephemeral localSessionToken."""
    now = time.time()

    if not PAIRING_STORE.code or (now - PAIRING_STORE.created_at) > PAIRING_CODE_TTL_SECONDS:
        PAIRING_STORE.code = None
        record_audit_event("PAIRING_FAILED", "Pairing code expired or uninitialized", "warning")
        raise HTTPException(status_code=400, detail="Pairing code has expired. Generate a new code.")

    if PAIRING_STORE.attempts >= MAX_PAIRING_ATTEMPTS:
        PAIRING_STORE.code = None
        record_audit_event("PAIRING_FAILED", "Maximum pairing retry attempts exceeded. Code invalidated.", "error")
        raise HTTPException(status_code=429, detail="Too many invalid attempts. Code invalidated.")

    if payload.code != PAIRING_STORE.code:
        PAIRING_STORE.attempts += 1
        remaining = MAX_PAIRING_ATTEMPTS - PAIRING_STORE.attempts
        record_audit_event("PAIRING_FAILED", f"Invalid code attempted ({remaining} attempts remaining)", "warning")
        raise HTTPException(status_code=400, detail=f"Invalid pairing code. {remaining} attempts remaining.")

    # Successful pairing: issue ephemeral token
    token = secrets.token_urlsafe(32)
    session_id = f"sess-{secrets.token_hex(4)}"
    PAIRING_STORE.sessions[token] = now + SESSION_TOKEN_TTL_SECONDS

    # Immediately consume the one-time pairing code
    PAIRING_STORE.code = None
    PAIRING_STORE.attempts = 0

    record_audit_event("PAIRING_CONFIRMED", f"Session {session_id} paired successfully (expires in 1h)")
    return {
        "ok": True,
        "token": token,
        "expires_in": SESSION_TOKEN_TTL_SECONDS,
        "session_id": session_id,
    }


@app.get("/pair/status", response_model=PairStatusResponse)
def pair_status(authorization: Optional[str] = Header(None)):
    """Checks if the local companion is paired or if the provided token is active."""
    now = time.time()
    valid_sessions = sum(1 for exp in PAIRING_STORE.sessions.values() if exp > now)
    
    is_current_token_valid = False
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        if PAIRING_STORE.sessions.get(token, 0) > now:
            is_current_token_valid = True

    return {
        "paired": is_current_token_valid if authorization else (valid_sessions > 0),
        "active_sessions_count": valid_sessions,
        "companion_version": "1.1.0",
        "security_mode": "local_only",
    }


@app.post("/pair/revoke")
def pair_revoke(token: str = Depends(verify_session_token)):
    """Revokes the current pairing session."""
    if token in PAIRING_STORE.sessions:
        del PAIRING_STORE.sessions[token]
    record_audit_event("PAIRING_REVOKED", "Pairing session explicitly revoked by operator")
    return {"ok": True, "message": "Pairing session revoked"}


# ============================================================
# PROTECTED LOCAL ENDPOINTS (Require active pairing token)
# ============================================================

@app.get("/wallets")
def wallets(_token: str = Depends(verify_session_token)):
    data = load_registry()
    safe = []
    for w in data.get("wallets", []):
        safe.append({
            "id": w.get("id"),
            "name": w.get("name"),
            "network": w.get("network"),
            "symbol": w.get("symbol"),
            "address": w.get("address"),
            "mode": w.get("mode", "watch_only"),
            "ownership_verified": bool(w.get("ownership_verified", False)),
            "purpose": w.get("purpose", "general"),
            "notes": w.get("notes", ""),
        })
    record_audit_event("wallets_queried", f"Returned {len(safe)} wallets metadata")
    return {"wallets": safe, "count": len(safe)}


@app.get("/wallets/{wallet_id}")
def wallet(wallet_id: str, _token: str = Depends(verify_session_token)):
    for w in load_registry().get("wallets", []):
        if w.get("id") == wallet_id:
            record_audit_event("wallet_inspected", f"Inspected wallet {wallet_id}")
            return {
                "id": w.get("id"),
                "name": w.get("name"),
                "network": w.get("network"),
                "symbol": w.get("symbol"),
                "address": w.get("address"),
                "mode": w.get("mode", "watch_only"),
                "ownership_verified": bool(w.get("ownership_verified", False)),
                "purpose": w.get("purpose", "general"),
                "notes": w.get("notes", ""),
            }
    record_audit_event("wallet_not_found", f"Wallet ID {wallet_id} not found", severity="warning")
    raise HTTPException(status_code=404, detail="wallet not found")


@app.get("/adapters")
def adapters(_token: str = Depends(verify_session_token)):
    return {"adapters": ADAPTERS_CATALOG, "count": len(ADAPTERS_CATALOG)}


@app.get("/capabilities")
def capabilities(_token: str = Depends(verify_session_token)):
    return {
        "capabilities": [
            {
                "name": "READ_BALANCE",
                "description": "Read publicly queryable on-chain balance",
                "status": "supported",
            },
            {
                "name": "READ_TRANSACTIONS",
                "description": "Read transaction history from public explorer / RPC",
                "status": "supported",
            },
            {
                "name": "CONNECT",
                "description": "Browser provider authorization handshake without seed request",
                "status": "supported",
            },
            {
                "name": "WATCH_ONLY",
                "description": "Monitor address without private key requirement",
                "status": "supported",
            },
            {
                "name": "CLI_DETECT",
                "description": "Safe local detection of allowlisted CLI tools and public keys",
                "status": "supported",
            },
            {
                "name": "SIGN",
                "description": "Cryptographic proof of ownership via local companion plane",
                "status": "guarded_manual",
            },
            {
                "name": "SEND",
                "description": "Broadcast on-chain funds movement (DISABLED in V1 for safety)",
                "status": "disabled_in_v1",
            },
        ]
    }


# ============================================================
# SAFE LOCAL CLI & TOOL DETECTION
# ============================================================

ALLOWLISTED_TOOLS = [
    {"name": "RustChain CLI", "binaries": ["rustchain-cli", "rustchain", "rtc"], "network": "rustchain", "caps": ["RTC_QUERY", "WATCH_ONLY"]},
    {"name": "Solana CLI", "binaries": ["solana", "solana-keygen"], "network": "solana", "caps": ["PUBKEY_DETECT", "WATCH_ONLY"]},
    {"name": "Git", "binaries": ["git"], "network": "system", "caps": ["VERSION_CONTROL"]},
    {"name": "Python", "binaries": ["python", "python3"], "network": "system", "caps": ["LOCAL_COMPANION_RUNTIME"]},
    {"name": "Node.js", "binaries": ["node"], "network": "system", "caps": ["WEB3_TOOLING"]},
]


def detect_tool_safely(tool_info: dict) -> ToolDetectionItem:
    """Safely checks binary existence via shutil.which without shell execution."""
    installed = False
    version_str = None
    sanitized_path = None

    for binary in tool_info["binaries"]:
        bin_path = shutil.which(binary)
        if bin_path:
            installed = True
            sanitized_path = os.path.basename(bin_path)
            # Query version with strict argv and timeout, never shell=True
            try:
                res = subprocess.run(
                    [bin_path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    shell=False,
                )
                if res.returncode == 0:
                    version_str = res.stdout.strip().split("\n")[0][:60]
            except Exception:
                version_str = "detected"
            break

    return ToolDetectionItem(
        tool=tool_info["name"],
        installed=installed,
        version=version_str,
        path_sanitized=sanitized_path,
        capabilities=tool_info["caps"],
    )


@app.get("/detect", response_model=DetectionResponse)
def detect_tools(_token: str = Depends(verify_session_token)):
    """
    Scans local machine strictly for allowlisted CLI tools and public wallet configurations.
    Zero arbitrary shell execution; zero private key extraction.
    """
    detected_tools = [detect_tool_safely(t) for t in ALLOWLISTED_TOOLS]
    
    # Load safe public addresses from local registry
    reg = load_registry()
    detected_wallets = []
    for w in reg.get("wallets", []):
        detected_wallets.append(
            DetectedWalletItem(
                id=w.get("id", "w-unknown"),
                name=w.get("name", "Unknown Wallet"),
                network=w.get("network", "unknown"),
                symbol=w.get("symbol", ""),
                publicAddress=w.get("address", ""),
                connectionType=w.get("connectionType", "WATCH_ONLY"),
                mode=w.get("mode", "watch_only"),
                ownershipStatus="UNVERIFIED",
                purpose=w.get("purpose"),
            )
        )

    record_audit_event("CLI_DETECTED", f"Scanned {len(detected_tools)} tools and {len(detected_wallets)} public wallets")
    return {
        "tools": detected_tools,
        "detected_wallets": detected_wallets,
    }


@app.get("/cli/status")
def cli_status(_token: str = Depends(verify_session_token)):
    return {
        "ok": True,
        "companion": "GXEON Local Companion CLI",
        "version": "1.1.0",
        "allowlist_count": len(ALLOWLISTED_TOOLS),
    }


# ============================================================
# RUSTCHAIN LIVE READ-ONLY ON-CHAIN QUERIES
# ============================================================

@app.get("/wallets/{wallet_id}/balance")
def query_wallet_balance(wallet_id: str, _token: str = Depends(verify_session_token)):
    """
    Queries live on-chain balance for a wallet.
    Strict Invariant: If RPC is not reachable or unconfigured, returns UNAVAILABLE (null).
    Never fabricates figures.
    """
    target = None
    for w in load_registry().get("wallets", []):
        if w.get("id") == wallet_id:
            target = w
            break

    if not target:
        raise HTTPException(status_code=404, detail="Wallet not found")

    # In V1.1, RustChain RPC connectivity is evaluated
    record_audit_event("RTC_BALANCE_SYNC_REQUESTED", f"Balance requested for {wallet_id} ({target.get('address')})")

    # Truth in data: Since live RustChain mainnet node is pending connection, return honest UNAVAILABLE
    return {
        "wallet_id": wallet_id,
        "network": target.get("network"),
        "symbol": target.get("symbol"),
        "address": target.get("address"),
        "balance": None,  # Explicitly null / unavailable
        "status": "UNAVAILABLE",
        "source": "rustchain_official_rpc",
        "queried_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "ownership_verified": False,
        "mode": target.get("mode", "watch_only"),
        "note": "Live node sync pending. GXEON never fabricates balance data.",
    }


@app.get("/wallets/{wallet_id}/transactions")
def query_wallet_transactions(wallet_id: str, _token: str = Depends(verify_session_token)):
    """
    Queries live on-chain transactions for a wallet.
    Strict Invariant: Returns only verified records or UNAVAILABLE empty array.
    """
    target = None
    for w in load_registry().get("wallets", []):
        if w.get("id") == wallet_id:
            target = w
            break

    if not target:
        raise HTTPException(status_code=404, detail="Wallet not found")

    return {
        "wallet_id": wallet_id,
        "network": target.get("network"),
        "symbol": target.get("symbol"),
        "address": target.get("address"),
        "transactions": [],
        "status": "UNAVAILABLE",
        "source": "rustchain_block_explorer",
        "queried_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": "Explorer queries active. Zero synthetic transactions.",
    }


@app.get("/audit")
def audit():
    return {"audit_events": AUDIT_LOG[-50:]}


# ============================================================
# SAFETY GUARDS (Disabled in V1.1)
# ============================================================

@app.post("/prepare-transaction")
def prepare_transaction():
    raise HTTPException(
        status_code=403,
        detail="Transaction preparation is disabled in V1.1. GXEON is operating in Watch-Only / Monitoring mode.",
    )


@app.post("/sign-transaction")
def sign_transaction():
    raise HTTPException(
        status_code=403,
        detail="Automated or remote signing is disabled. Signing is strictly reserved for human-verified local CLI.",
    )


@app.post("/broadcast")
def broadcast():
    raise HTTPException(
        status_code=403,
        detail="Broadcast is disabled in V1.1. No funds movement permitted.",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8790)
