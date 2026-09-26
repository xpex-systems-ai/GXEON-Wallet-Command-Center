from __future__ import annotations

import datetime
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request, Response, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
REGISTRY = BASE_DIR / "config" / "wallets.json"
MINER_CONFIG_FILE = BASE_DIR / "config" / "miner_config.json"

app = FastAPI(
    title="GXEON Local Companion Bridge V1.2",
    description="Local-first pairing, ClawRTC Proof of Antiquity, and non-custodial wallet discovery engine for GXEON Command Center.",
    version="1.2.0",
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
async def private_network_access_and_host_middleware(request: Request, call_next):
    """
    1. Host header validation: strictly 127.0.0.1, localhost, or testserver.
    2. Private Network Access (PNA): Emits Access-Control-Allow-Private-Network ONLY if Origin is in ALLOWED_ORIGINS.
    """
    host = request.headers.get("host", "")
    host_name = host.split(":")[0].lower()
    
    # If Host header is provided, validate that it points to localhost / loopback
    if host_name and host_name not in ("127.0.0.1", "localhost", "testserver"):
        return Response(status_code=400, content="Invalid Host header: bridge only accepts loopback host.")

    response: Response = await call_next(request)
    
    origin = request.headers.get("origin")
    pna_requested = request.headers.get("Access-Control-Request-Private-Network") == "true"
    
    # PNA permission ONLY given to validated origins in ALLOWED_ORIGINS
    if pna_requested:
        if origin and origin in ALLOWED_ORIGINS:
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


# ============================================================
# MINING & CLAWRTC STATE
# ============================================================

class MiningState:
    status: str = "STOPPED"  # STOPPED, MINING, CONFIGURED, NOT_INSTALLED, NOT_CONFIGURED, ERROR
    miner_id: Optional[str] = None
    reward_destination: Optional[str] = None
    reward_destination_source: str = "UNCONFIGURED"
    config_source: str = "UNCONFIGURED"  # UNCONFIGURED, LOCAL_METADATA_CONFIGURED, CLAWRTC_CONFIGURED
    started_at: Optional[float] = None
    last_attestation_timestamp: Optional[str] = None
    last_attestation_status: str = "UNATTESTED"  # UNATTESTED, ATTESTED, EXPIRED, FAILED
    current_epoch: Optional[int] = None  # None / null by default (never synthetic 42)
    antiquity_multiplier: Optional[float] = None  # None / unavailable until real proof returned
    confirmed_rtc: Optional[float] = None  # None / null by default (never synthetic 0.0)
    pending_rewards: Optional[float] = None  # None / null by default (never synthetic 0.0)
    estimated_rewards: Optional[float] = None
    pid: Optional[int] = None
    exit_code: Optional[int] = None


MINING_STORE = MiningState()
MINER_PROCESS: Optional[subprocess.Popen] = None
MINER_PROCESS_LOCK = threading.RLock()

# Non-sensitive audit buffer
AUDIT_LOG: List[Dict[str, Any]] = [
    {
        "id": "init-001",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": "COMPANION_STARTED",
        "detail": "GXEON Local Companion V1.2 (Quantum Core) initialized on 127.0.0.1:8790",
        "severity": "info",
    }
]


def record_audit_event(event: str, detail: str, severity: str = "info") -> None:
    AUDIT_LOG.append({
        "id": f"evt-{int(time.time() * 1000)}",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": event,
        "detail": detail,
        "severity": severity,
    })
    if len(AUDIT_LOG) > 500:
        del AUDIT_LOG[:-500]


def load_registry() -> dict[str, Any]:
    if not REGISTRY.exists():
        return {"version": 1, "wallets": []}
    try:
        return json.loads(REGISTRY.read_text(encoding="utf-8"))
    except Exception as e:
        record_audit_event("registry_read_error", str(e), severity="error")
        return {"version": 1, "wallets": []}


def get_hardware_metadata() -> dict[str, str]:
    """Collects strictly non-sensitive hardware metadata for Proof of Antiquity."""
    return {
        "cpu_arch": platform.machine() or "x86_64",
        "processor": platform.processor() or "Standard CPU",
        "os": f"{platform.system()} {platform.release()}",
        "compatibility": "DETECTED_HARDWARE",
    }


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
    companion_version: str
    security_mode: str


class ToolDetectionItem(BaseModel):
    tool: str
    installed: bool
    version: Optional[str] = None
    path_sanitized: Optional[str] = None
    capabilities: List[str] = []
    public_address_discovery: str = "UNAVAILABLE"
    miner_id_discovery: Optional[str] = None


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
    registered_wallets: List[DetectedWalletItem]


class MiningStatusResponse(BaseModel):
    status: str
    clawrtc_installed: bool
    clawrtc_version: Optional[str] = None
    miner_id: Optional[str] = None
    reward_destination: Optional[str] = None
    reward_destination_source: str = "UNCONFIGURED"
    config_source: str = "UNCONFIGURED"
    hardware: Dict[str, str]
    attestation_state: str
    attestation_id: Optional[str] = None
    last_attestation_timestamp: Optional[str] = None
    current_epoch: Optional[int] = None
    antiquity_multiplier: Optional[float] = None
    confirmed_rtc: Optional[float] = None
    pending_rewards: Optional[float] = None
    estimated_rewards: Optional[float] = None
    pid: Optional[int] = None
    process_alive: bool = False
    exit_code: Optional[int] = None
    supported_commands: List[str] = []
    source: str
    queried_at: str


class MiningConfigureRequest(BaseModel):
    miner_id: str = Field(..., min_length=1, max_length=128)
    reward_destination: Optional[str] = Field(None, max_length=128)


# ============================================================
# ADAPTERS CATALOG (Truthful capability matrix)
# ============================================================

ADAPTERS_CATALOG = [
    {
        "id": "rustchain",
        "name": "RustChain RTC Adapter",
        "network": "rustchain",
        "version": "1.2.0",
        "status": "partial",
        "capabilities": ["WATCH_ONLY"],
        "capabilities_details": {
            "WATCH_ONLY": "AVAILABLE",
            "READ_BALANCE": "UNAVAILABLE",
            "READ_TRANSACTIONS": "UNAVAILABLE",
            "SIGN": "DISABLED",
            "SEND": "DISABLED",
            "BROADCAST": "DISABLED",
        },
        "description": "Watch-only monitoring for RustChain (RTC). Balance and transaction RPCs are UNAVAILABLE until verified source node is active.",
    },
    {
        "id": "clawrtc",
        "name": "ClawRTC Proof of Antiquity Adapter",
        "network": "rustchain",
        "version": "1.2.0",
        "status": "active",
        "capabilities": ["MINING_CONTROL", "PROOF_OF_ANTIQUITY", "WATCH_ONLY"],
        "capabilities_details": {
            "MINING_CONTROL": "AVAILABLE",
            "PROOF_OF_ANTIQUITY": "AVAILABLE",
            "WATCH_ONLY": "AVAILABLE",
            "SIGN": "DISABLED",
            "SEND": "DISABLED",
        },
        "description": "Native Proof of Antiquity mining engine controller and attestation tracker.",
    },
    {
        "id": "evm-metamask",
        "name": "MetaMask / EIP-1193 EVM Adapter",
        "network": "evm",
        "version": "1.2.0",
        "status": "active",
        "capabilities": ["CONNECT", "READ_BALANCE", "WATCH_ONLY"],
        "capabilities_details": {
            "CONNECT": "AVAILABLE",
            "READ_BALANCE": "AVAILABLE",
            "WATCH_ONLY": "AVAILABLE",
            "READ_TRANSACTIONS": "UNAVAILABLE",
            "SIGN": "UNAVAILABLE",
            "SEND": "DISABLED",
        },
        "supported_chains": ["Ethereum Mainnet", "Base", "Polygon", "Arbitrum One"],
        "description": "Browser provider connector for EVM chains. Keys never leave the browser extension.",
    },
    {
        "id": "coinbase-wallet",
        "name": "Coinbase Wallet Adapter",
        "network": "evm",
        "version": "1.2.0",
        "status": "partial",
        "capabilities": ["CONNECT", "WATCH_ONLY"],
        "capabilities_details": {
            "CONNECT": "AVAILABLE",
            "WATCH_ONLY": "AVAILABLE",
            "READ_BALANCE": "UNAVAILABLE",
            "SIGN": "UNAVAILABLE",
            "SEND": "DISABLED",
        },
        "description": "Dedicated Coinbase Wallet extension connector. Separate from custodial exchange APIs.",
    },
    {
        "id": "solana",
        "name": "Solana CLI Adapter",
        "network": "solana",
        "version": "0.3.0",
        "status": "partial",
        "capabilities": ["CLI_DETECT", "WATCH_ONLY"],
        "capabilities_details": {
            "CLI_DETECT": "AVAILABLE",
            "WATCH_ONLY": "AVAILABLE",
            "READ_BALANCE": "UNAVAILABLE",
            "SIGN": "DISABLED",
            "SEND": "DISABLED",
        },
        "description": "Non-custodial Solana CLI address discovery. Signing remains local-only.",
    },
]


# ============================================================
# PUBLIC ENDPOINTS (No token required)
# ============================================================

@app.get("/health")
def health():
    """Minimal public health endpoint. Does not reveal active session count."""
    return {
        "ok": True,
        "service": "gxeon-wallet-local-companion",
        "bind": "127.0.0.1",
        "port": 8790,
        "security_mode": "local_only",
        "version": "1.2.0",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@app.get("/status")
def status():
    """
    Public bridge status summary.
    Invariant: Active session counts and sensitive tokens are NOT revealed publicly.
    """
    registry_data = load_registry()
    wallet_count = len(registry_data.get("wallets", []))
    clawrtc_bin = shutil.which("clawrtc") or shutil.which("clawrtc-cli")
    with MINER_PROCESS_LOCK:
        global MINER_PROCESS
        if MINER_PROCESS is not None:
            polled = MINER_PROCESS.poll()
            if polled is None:
                MINING_STORE.status = "MINING"
                MINING_STORE.pid = MINER_PROCESS.pid
            else:
                MINING_STORE.exit_code = polled
                MINING_STORE.pid = None
                MINER_PROCESS = None
                MINING_STORE.status = "STOPPED" if polled == 0 else "ERROR"
        elif not clawrtc_bin:
            MINING_STORE.status = "NOT_INSTALLED"
        elif not MINING_STORE.miner_id:
            discovered = discover_clawrtc_miner_id(clawrtc_bin)
            if discovered:
                MINING_STORE.miner_id = discovered
                MINING_STORE.config_source = "CLAWRTC_CONFIGURED"
                MINING_STORE.status = "CONFIGURED"
            else:
                MINING_STORE.status = "NOT_CONFIGURED"
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
        "mining_status": MINING_STORE.status,
        "uptime": "active",
    }


# ============================================================
# PAIRING PROTOCOL ENDPOINTS
# ============================================================

@app.post("/pair/start", response_model=PairStartResponse)
def pair_start(request: Request):
    """
    Generates a secure, 6-digit numeric pairing code with 5-minute TTL.
    SECURITY INVARIANT:
    Must ONLY be invoked via local CLI (no browser Origin header).
    If invoked by browser with Origin header, rejects with HTTP 403 Forbidden.
    """
    origin = request.headers.get("origin")
    if origin:
        record_audit_event("PAIRING_START_BLOCKED", f"Browser origin {origin} blocked from reading raw pairing code", "warning")
        raise HTTPException(
            status_code=403,
            detail="Pairing codes cannot be generated via web browser. Run 'gxeon_wallet.py pair' in your local CLI.",
        )

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    PAIRING_STORE.code = code
    PAIRING_STORE.created_at = time.time()
    PAIRING_STORE.attempts = 0

    record_audit_event("PAIRING_STARTED", "Generated ephemeral 6-digit pairing code via local CLI")
    return {
        "ok": True,
        "pairing_code": code,
        "expires_in": PAIRING_CODE_TTL_SECONDS,
        "message": "Enter this 6-digit pairing code in the GXEON Web Command Center UI",
    }


@app.post("/pair/confirm", response_model=PairConfirmResponse)
def pair_confirm(payload: PairConfirmRequest):
    """Validates the 6-digit code entered in web UI and issues an ephemeral localSessionToken."""
    now = time.time()

    if not PAIRING_STORE.code or (now - PAIRING_STORE.created_at) > PAIRING_CODE_TTL_SECONDS:
        PAIRING_STORE.code = None
        record_audit_event("PAIRING_FAILED", "Pairing code expired or uninitialized", "warning")
        raise HTTPException(status_code=400, detail="Pairing code has expired. Run 'gxeon_wallet.py pair' to generate a new code.")

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
def pair_status(_token: str = Depends(verify_session_token)):
    """
    Protected endpoint: Checks if the session token is valid and active.
    Requires Bearer authorization token.
    """
    return {
        "paired": True,
        "companion_version": "1.2.0",
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
                "name": "MINING_CONTROL",
                "description": "Safe control of ClawRTC Proof of Antiquity mining engine",
                "status": "supported",
            },
            {
                "name": "PROOF_OF_ANTIQUITY",
                "description": "Hardware attestation and antiquity multiplier tracking",
                "status": "supported",
            },
            {
                "name": "CONNECT",
                "description": "Browser provider authorization handshake without seed request",
                "status": "supported",
            },
            {
                "name": "READ_BALANCE",
                "description": "Read publicly queryable on-chain balance (unavailable for unconfigured RPCs)",
                "status": "unavailable",
            },
            {
                "name": "READ_TRANSACTIONS",
                "description": "Read transaction history from public explorer / RPC",
                "status": "unavailable",
            },
            {
                "name": "SIGN",
                "description": "Cryptographic proof of ownership via local companion plane (DISABLED in V1.2)",
                "status": "disabled_in_v1",
            },
            {
                "name": "SEND",
                "description": "Broadcast on-chain funds movement (DISABLED in V1.2 for safety)",
                "status": "disabled_in_v1",
            },
            {
                "name": "BROADCAST",
                "description": "Broadcast on-chain transactions (DISABLED in V1.2)",
                "status": "disabled_in_v1",
            },
        ]
    }


# ============================================================
# SAFE LOCAL CLI & TOOL DETECTION (Subprocess with shell=False)
# ============================================================

ALLOWLISTED_TOOLS = [
    {
        "name": "ClawRTC",
        "binaries": ["clawrtc", "clawrtc-cli"],
        "network": "rustchain",
        "caps": ["MINING_CONTROL", "PROOF_OF_ANTIQUITY", "WATCH_ONLY"],
        "can_discover_address": False,
        "can_discover_miner_id": True,
    },
    {
        "name": "RustChain CLI",
        "binaries": ["rustchain-cli", "rustchain", "rtc"],
        "network": "rustchain",
        "caps": ["WATCH_ONLY"],
        "can_discover_address": False,
        "can_discover_miner_id": False,
    },
    {
        "name": "Solana CLI",
        "binaries": ["solana", "solana-keygen"],
        "network": "solana",
        "caps": ["PUBKEY_DETECT", "WATCH_ONLY"],
        "can_discover_address": True,
        "can_discover_miner_id": False,
    },
    {
        "name": "Git",
        "binaries": ["git"],
        "network": "system",
        "caps": ["VERSION_CONTROL"],
        "can_discover_address": False,
        "can_discover_miner_id": False,
    },
    {
        "name": "Python",
        "binaries": ["python", "python3"],
        "network": "system",
        "caps": ["LOCAL_COMPANION_RUNTIME"],
        "can_discover_address": False,
        "can_discover_miner_id": False,
    },
    {
        "name": "Node.js",
        "binaries": ["node"],
        "network": "system",
        "caps": ["WEB3_TOOLING"],
        "can_discover_address": False,
        "can_discover_miner_id": False,
    },
]


def detect_tool_safely(tool_info: dict) -> tuple[ToolDetectionItem, Optional[str], Optional[str]]:
    """
    Safely checks binary existence via shutil.which without shell execution.
    Returns (ToolDetectionItem, Optional[discovered_public_address], Optional[discovered_miner_id]).
    """
    installed = False
    version_str = None
    sanitized_path = None
    discovered_address = None
    discovered_miner = None
    matched_binary_path = None

    for binary in tool_info["binaries"]:
        bin_path = shutil.which(binary)
        if bin_path:
            installed = True
            sanitized_path = os.path.basename(bin_path)
            matched_binary_path = bin_path
            # Query version with strict fixed argv and timeout, never shell=True
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

    # Real public key discovery ONLY for safe, verified commands
    pubkey_discovery_status = "UNAVAILABLE"
    miner_discovery_status = "NOT_DETECTED"

    if installed and tool_info.get("can_discover_address") and matched_binary_path:
        # Solana CLI safe address query: 'solana address'
        if tool_info.get("network") == "solana":
            try:
                res = subprocess.run(
                    [matched_binary_path, "address"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    shell=False,
                )
                if res.returncode == 0:
                    raw_addr = res.stdout.strip()
                    # Validate Solana Base58 public key format (32 to 44 chars)
                    if re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", raw_addr):
                        discovered_address = raw_addr
                        pubkey_discovery_status = "AVAILABLE"
            except Exception:
                pubkey_discovery_status = "UNAVAILABLE"

    # ClawRTC miner ID discovery
    if installed and tool_info.get("name") == "ClawRTC" and matched_binary_path:
        try:
            res = subprocess.run(
                [matched_binary_path, "id"],
                capture_output=True,
                text=True,
                timeout=3,
                shell=False,
            )
            if res.returncode == 0:
                raw_id = res.stdout.strip()
                if len(raw_id) >= 3 and len(raw_id) <= 64 and not any(k in raw_id.lower() for k in ["private", "seed", "key"]):
                    discovered_miner = raw_id
                    miner_discovery_status = "DETECTED"
        except Exception:
            miner_discovery_status = "NOT_DETECTED"

    item = ToolDetectionItem(
        tool=tool_info["name"],
        installed=installed,
        version=version_str,
        path_sanitized=sanitized_path,
        capabilities=tool_info["caps"],
        public_address_discovery=pubkey_discovery_status,
        miner_id_discovery=miner_discovery_status,
    )
    return item, discovered_address, discovered_miner


@app.get("/detect", response_model=DetectionResponse)
def detect_tools(_token: str = Depends(verify_session_token)):
    """
    Scans local machine strictly for allowlisted CLI tools and public wallet configurations.
    Zero arbitrary shell execution; zero private key extraction.
    Separates dynamically detected_wallets from statically registered_wallets.
    """
    detected_tools: List[ToolDetectionItem] = []
    detected_wallets: List[DetectedWalletItem] = []

    for t in ALLOWLISTED_TOOLS:
        item, addr, miner_id = detect_tool_safely(t)
        detected_tools.append(item)
        if addr and t.get("network") == "solana":
            detected_wallets.append(
                DetectedWalletItem(
                    id="detected-solana-cli-default",
                    name="Solana CLI Default Keypair",
                    network="solana",
                    symbol="SOL",
                    publicAddress=addr,
                    connectionType="CLI_DETECTED",
                    mode="watch_only",
                    ownershipStatus="UNVERIFIED",
                    purpose="Discovered via local Solana CLI ('solana address')",
                )
            )
        if miner_id and t.get("name") == "ClawRTC":
            MINING_STORE.miner_id = miner_id
            if MINING_STORE.status == "NOT_INSTALLED":
                MINING_STORE.status = "CONFIGURED"

    # Load statically registered public addresses from local registry
    reg = load_registry()
    registered_wallets: List[DetectedWalletItem] = []
    for w in reg.get("wallets", []):
        registered_wallets.append(
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

    record_audit_event("CLI_DETECTED", f"Scanned {len(detected_tools)} tools, {len(detected_wallets)} live CLI wallets, and {len(registered_wallets)} registered wallets")
    return {
        "tools": detected_tools,
        "detected_wallets": detected_wallets,
        "registered_wallets": registered_wallets,
    }


# ============================================================
# CLAWRTC & MINING CONTROL ENDPOINTS (Proof of Antiquity)
# ============================================================


def discover_clawrtc_miner_id(binary_path: str) -> Optional[str]:
    """Reads only the public miner identity from ClawRTC when supported."""
    try:
        res = subprocess.run([binary_path, "id"], capture_output=True, text=True, timeout=3, shell=False)
        raw_id = res.stdout.strip() if res.returncode == 0 else ""
        if 3 <= len(raw_id) <= 128 and not any(k in raw_id.lower() for k in ["private", "seed", "secret", "key"]):
            return raw_id
    except Exception:
        pass
    return None


def query_clawrtc_live_status(binary_path: str) -> None:
    """Best-effort ingestion of real ClawRTC status JSON. Missing/unsupported fields remain unavailable."""
    try:
        help_res = subprocess.run([binary_path, "--help"], capture_output=True, text=True, timeout=3, shell=False)
        if "status" not in (help_res.stdout + help_res.stderr).lower():
            return
        res = subprocess.run([binary_path, "status", "--json"], capture_output=True, text=True, timeout=4, shell=False)
        if res.returncode != 0 or not res.stdout.strip():
            return
        data = json.loads(res.stdout)
        att = data.get("attestation_state") or data.get("attestationStatus")
        if isinstance(att, str) and att.upper() in ("UNATTESTED", "PENDING", "ATTESTED", "EXPIRED", "FAILED"):
            MINING_STORE.last_attestation_status = att.upper()
            if att.upper() == "ATTESTED":
                MINING_STORE.last_attestation_timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        epoch = data.get("current_epoch", data.get("epoch"))
        if isinstance(epoch, int):
            MINING_STORE.current_epoch = epoch
        for key, attr in [
            ("antiquity_multiplier", "antiquity_multiplier"),
            ("confirmed_rtc", "confirmed_rtc"),
            ("pending_rewards", "pending_rewards"),
            ("estimated_rewards", "estimated_rewards"),
        ]:
            value = data.get(key)
            if isinstance(value, (int, float)):
                setattr(MINING_STORE, attr, float(value))
    except Exception:
        # Unsupported command/output is not evidence of failure; values stay unavailable.
        return


def try_apply_reward_destination(binary_path: str, destination: str) -> bool:
    """Apply reward destination only when ClawRTC explicitly advertises a set-wallet command."""
    try:
        res = subprocess.run([binary_path, "config", "--help"], capture_output=True, text=True, timeout=3, shell=False)
        help_text = (res.stdout + res.stderr).lower()
        if "set-wallet" not in help_text:
            return False
        applied = subprocess.run(
            [binary_path, "config", "set-wallet", destination],
            capture_output=True,
            text=True,
            timeout=4,
            shell=False,
        )
        return applied.returncode == 0
    except Exception:
        return False


def inspect_clawrtc_capabilities(binary_path: str) -> List[str]:
    """
    Safely inspects installed ClawRTC binary for supported subcommands via --help.
    Returns list of discovered capability flags without assuming unconfirmed commands exist.
    """
    try:
        res = subprocess.run([binary_path, "--help"], capture_output=True, text=True, timeout=3, shell=False)
        help_text = (res.stdout + res.stderr).lower()
        caps = ["VERSION_CHECK"]
        if "mine" in help_text or "mining" in help_text or "start" in help_text:
            caps.append("MINING_CONTROL")
        if "antiquity" in help_text or "poa" in help_text or "attest" in help_text:
            caps.append("PROOF_OF_ANTIQUITY")
        if "config" in help_text or "set-miner" in help_text:
            caps.append("CONFIG_MANAGEMENT")
        if "wallet" in help_text or "address" in help_text:
            caps.append("WALLET_MANAGEMENT")
        if "status" in help_text:
            caps.append("STATUS_QUERY")
        return caps
    except Exception:
        return ["VERSION_CHECK"]


@app.get("/mining/status", response_model=MiningStatusResponse)
def get_mining_status(_token: str = Depends(verify_session_token)):
    """
    Returns full Proof of Antiquity status, hardware metadata, process state, and ClawRTC mining state.
    Strict Invariant: No fake multipliers or synthetic balances.
    """
    global MINER_PROCESS
    clawrtc_bin = shutil.which("clawrtc") or shutil.which("clawrtc-cli")
    clawrtc_installed = bool(clawrtc_bin)
    version_str = None
    supported_caps: List[str] = []

    if clawrtc_installed:
        try:
            res = subprocess.run([clawrtc_bin, "--version"], capture_output=True, text=True, timeout=3, shell=False)
            if res.returncode == 0:
                version_str = res.stdout.strip()
            supported_caps = inspect_clawrtc_capabilities(clawrtc_bin)
        except Exception:
            version_str = None

    if clawrtc_installed and clawrtc_bin:
        if not MINING_STORE.miner_id:
            discovered = discover_clawrtc_miner_id(clawrtc_bin)
            if discovered:
                MINING_STORE.miner_id = discovered
                MINING_STORE.config_source = "CLAWRTC_CONFIGURED"
        query_clawrtc_live_status(clawrtc_bin)

    # Verify real process health
    process_alive = False
    if MINER_PROCESS is not None:
        poll_res = MINER_PROCESS.poll()
        if poll_res is None:
            process_alive = True
            MINING_STORE.status = "MINING"
            MINING_STORE.pid = MINER_PROCESS.pid
            MINING_STORE.exit_code = None
        else:
            # Process died or completed
            process_alive = False
            MINING_STORE.exit_code = poll_res
            MINING_STORE.status = "ERROR" if poll_res != 0 else "STOPPED"
            MINING_STORE.pid = None
            MINER_PROCESS = None
    else:
        if not clawrtc_installed:
            MINING_STORE.status = "NOT_INSTALLED"
        elif not MINING_STORE.miner_id:
            MINING_STORE.status = "NOT_CONFIGURED"
        elif MINING_STORE.status not in ("MINING", "ERROR", "STOPPED"):
            MINING_STORE.status = "CONFIGURED"

    return {
        "status": MINING_STORE.status,
        "clawrtc_installed": clawrtc_installed,
        "clawrtc_version": version_str,
        "miner_id": MINING_STORE.miner_id,
        "reward_destination": MINING_STORE.reward_destination,
        "reward_destination_source": MINING_STORE.reward_destination_source,
        "config_source": MINING_STORE.config_source,
        "hardware": get_hardware_metadata(),
        "attestation_state": MINING_STORE.last_attestation_status,
        "attestation_id": None,
        "last_attestation_timestamp": MINING_STORE.last_attestation_timestamp,
        "current_epoch": MINING_STORE.current_epoch,
        "antiquity_multiplier": MINING_STORE.antiquity_multiplier,
        "confirmed_rtc": MINING_STORE.confirmed_rtc,
        "pending_rewards": MINING_STORE.pending_rewards,
        "estimated_rewards": MINING_STORE.estimated_rewards,
        "pid": MINING_STORE.pid,
        "process_alive": process_alive,
        "exit_code": MINING_STORE.exit_code,
        "supported_commands": supported_caps,
        "source": "local_companion_clawrtc" if clawrtc_installed else "none",
        "queried_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@app.post("/mining/configure")
def configure_mining(payload: MiningConfigureRequest, _token: str = Depends(verify_session_token)):
    """Configure public miner identity and, only when supported, the reward destination."""
    miner_id_clean = payload.miner_id.strip()
    if not miner_id_clean:
        raise HTTPException(status_code=400, detail="Miner ID cannot be blank")

    MINING_STORE.miner_id = miner_id_clean
    destination = payload.reward_destination.strip() if payload.reward_destination else None
    MINING_STORE.reward_destination = destination
    MINING_STORE.reward_destination_source = "UNCONFIGURED" if not destination else "LOCAL_METADATA_ONLY"

    clawrtc_bin = shutil.which("clawrtc") or shutil.which("clawrtc-cli")
    config_source = "LOCAL_METADATA_CONFIGURED"

    if clawrtc_bin:
        try:
            res = subprocess.run(
                [clawrtc_bin, "config", "set-miner", miner_id_clean],
                capture_output=True,
                text=True,
                timeout=3,
                shell=False,
            )
            if res.returncode == 0:
                discovered = discover_clawrtc_miner_id(clawrtc_bin)
                if discovered == miner_id_clean:
                    config_source = "CLAWRTC_CONFIGURED"
        except Exception:
            pass

        if destination and try_apply_reward_destination(clawrtc_bin, destination):
            MINING_STORE.reward_destination_source = "CLAWRTC_CONFIGURED"

    MINING_STORE.config_source = config_source
    if not clawrtc_bin:
        MINING_STORE.status = "NOT_INSTALLED"
    elif config_source == "CLAWRTC_CONFIGURED":
        MINING_STORE.status = "CONFIGURED"
    else:
        MINING_STORE.status = "NOT_CONFIGURED"

    record_audit_event(
        "MINER_CONFIGURED",
        f"Miner identity state={config_source}; reward destination state={MINING_STORE.reward_destination_source}",
    )
    return {
        "ok": config_source == "CLAWRTC_CONFIGURED",
        "message": (
            "Miner identity verified in ClawRTC."
            if config_source == "CLAWRTC_CONFIGURED"
            else "Miner metadata saved locally, but ClawRTC identity was not verified."
        ),
        "miner_id": MINING_STORE.miner_id,
        "reward_destination": MINING_STORE.reward_destination,
        "reward_destination_source": MINING_STORE.reward_destination_source,
        "config_source": config_source,
    }


@app.post("/mining/start")
def start_mining(_token: str = Depends(verify_session_token)):
    """Start one verified ClawRTC miner process with serialized process ownership."""
    global MINER_PROCESS
    clawrtc_bin = shutil.which("clawrtc") or shutil.which("clawrtc-cli")
    if not clawrtc_bin:
        MINING_STORE.status = "NOT_INSTALLED"
        raise HTTPException(status_code=409, detail="ClawRTC binary not found in PATH.")

    if not MINING_STORE.miner_id:
        discovered = discover_clawrtc_miner_id(clawrtc_bin)
        if discovered:
            MINING_STORE.miner_id = discovered
            MINING_STORE.config_source = "CLAWRTC_CONFIGURED"

    if not MINING_STORE.miner_id or MINING_STORE.config_source != "CLAWRTC_CONFIGURED":
        MINING_STORE.status = "NOT_CONFIGURED"
        raise HTTPException(status_code=409, detail="ClawRTC miner identity is not verified/configured.")

    if MINING_STORE.reward_destination and MINING_STORE.reward_destination_source != "CLAWRTC_CONFIGURED":
        raise HTTPException(
            status_code=409,
            detail="Reward destination is metadata-only and has not been applied to ClawRTC. Mining start blocked to prevent misrouted rewards.",
        )

    with MINER_PROCESS_LOCK:
        if MINER_PROCESS is not None and MINER_PROCESS.poll() is None:
            return {
                "ok": True,
                "status": "MINING",
                "miner_id": MINING_STORE.miner_id,
                "pid": MINER_PROCESS.pid,
                "message": "Miner process is already running",
            }

        try:
            proc = subprocess.Popen(
                [clawrtc_bin, "mine"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
            )
        except Exception as e:
            MINING_STORE.status = "ERROR"
            record_audit_event("MINER_START_FAILED", f"Failed to spawn ClawRTC process: {e}", "error")
            raise HTTPException(status_code=500, detail="Failed to start miner process.")

        time.sleep(0.1)
        if proc.poll() is not None:
            MINING_STORE.status = "ERROR"
            MINING_STORE.exit_code = proc.poll()
            raise HTTPException(status_code=500, detail=f"Miner process terminated immediately with exit code {proc.poll()}")

        MINER_PROCESS = proc
        MINING_STORE.pid = proc.pid
        MINING_STORE.status = "MINING"
        MINING_STORE.started_at = time.time()
        MINING_STORE.last_attestation_status = "UNATTESTED"
        MINING_STORE.exit_code = None

    record_audit_event("MINER_STARTED", f"Started ClawRTC miner PID {proc.pid}")
    return {
        "ok": True,
        "status": "MINING",
        "miner_id": MINING_STORE.miner_id,
        "pid": proc.pid,
        "started_at": MINING_STORE.started_at,
        "message": "ClawRTC process started. Attestation/reward fields remain unavailable until verified live status is observed.",
    }


@app.post("/mining/stop")
def stop_mining(_token: str = Depends(verify_session_token)):
    """Stop the tracked miner and never discard a still-live process handle."""
    global MINER_PROCESS
    with MINER_PROCESS_LOCK:
        proc = MINER_PROCESS
        if proc is None:
            MINING_STORE.status = "STOPPED"
            MINING_STORE.pid = None
            return {"ok": True, "status": "STOPPED", "message": "No tracked miner process is running."}

        if proc.poll() is None:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)
            except Exception as e:
                record_audit_event("MINER_STOP_ERROR", f"Error stopping process: {e}", "error")
                if proc.poll() is None:
                    MINING_STORE.status = "ERROR"
                    MINING_STORE.pid = proc.pid
                    raise HTTPException(status_code=500, detail="Miner stop failed; process is still alive and remains tracked.")

        MINING_STORE.exit_code = proc.poll()
        MINER_PROCESS = None
        MINING_STORE.status = "STOPPED"
        MINING_STORE.pid = None
        MINING_STORE.started_at = None

    record_audit_event("MINER_STOPPED", "Operator explicitly stopped ClawRTC mining process")
    return {"ok": True, "status": "STOPPED", "message": "ClawRTC mining stopped"}


@app.on_event("shutdown")
def shutdown_miner_cleanup():
    """Best-effort cleanup so companion shutdown does not orphan the miner."""
    global MINER_PROCESS
    with MINER_PROCESS_LOCK:
        proc = MINER_PROCESS
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    return
        if proc is None or proc.poll() is not None:
            MINER_PROCESS = None
            MINING_STORE.pid = None
            if MINING_STORE.status == "MINING":
                MINING_STORE.status = "STOPPED"


@app.get("/cli/status")
def cli_status(_token: str = Depends(verify_session_token)):
    return {
        "ok": True,
        "companion": "GXEON Local Companion CLI",
        "version": "1.2.0",
        "allowlist_count": len(ALLOWLISTED_TOOLS),
    }


# ============================================================
# RUSTCHAIN LIVE READ-ONLY ON-CHAIN QUERIES (Honest Fallback)
# ============================================================

@app.get("/wallets/{wallet_id}/balance")
def query_wallet_balance(wallet_id: str, _token: str = Depends(verify_session_token)):
    """
    Queries live on-chain balance for a wallet.
    Strict Invariant: Since no official verified RustChain RPC endpoint is configured, returns UNAVAILABLE (null).
    Never fabricates figures.
    """
    target = None
    for w in load_registry().get("wallets", []):
        if w.get("id") == wallet_id:
            target = w
            break

    if not target:
        raise HTTPException(status_code=404, detail="Wallet not found")

    record_audit_event("RTC_BALANCE_SYNC_REQUESTED", f"Balance requested for {wallet_id} ({target.get('address')})")

    # Truth in data: No verified RustChain RPC node is active; returns honest UNAVAILABLE
    return {
        "wallet_id": wallet_id,
        "network": target.get("network"),
        "symbol": target.get("symbol"),
        "address": target.get("address"),
        "balance": None,  # Explicitly null / unavailable
        "status": "UNAVAILABLE",
        "source": "none",
        "queried_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "ownership_verified": False,
        "mode": target.get("mode", "watch_only"),
        "note": "No verified RustChain RPC node source configured. Truth in data: balance is UNAVAILABLE.",
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
        "source": "none",
        "queried_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": "No verified RustChain transaction indexer configured. Truth in data: history is UNAVAILABLE.",
    }


@app.get("/audit")
def audit(_token: str = Depends(verify_session_token)):
    return {"audit_events": AUDIT_LOG[-50:]}


# ============================================================
# SAFETY GUARDS (Disabled in V1.2)
# ============================================================

@app.post("/prepare-transaction")
def prepare_transaction():
    raise HTTPException(
        status_code=403,
        detail="Transaction preparation is disabled in V1.2. GXEON is operating in Watch-Only / Monitoring mode.",
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
        detail="Broadcast is disabled in V1.2. No funds movement permitted.",
    )


@app.post("/send")
def send():
    raise HTTPException(
        status_code=403,
        detail="Funds movement is disabled in V1.2. No send operations permitted.",
    )


@app.post("/sign")
def sign():
    raise HTTPException(
        status_code=403,
        detail="Signing is disabled in V1.2. No remote signing permitted.",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8790)
