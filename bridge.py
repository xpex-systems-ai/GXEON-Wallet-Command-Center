from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
REGISTRY = BASE_DIR / "config" / "wallets.json"

app = FastAPI(
    title="GXEON Wallet Local Bridge",
    description="Local signing & discovery plane for GXEON Command Center. Strictly bound to 127.0.0.1.",
    version="1.0.0",
)

# CORS restricted to local development environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory non-sensitive bridge audit event buffer
AUDIT_LOG: List[Dict[str, Any]] = [
    {
        "id": "init-001",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": "bridge_initialized",
        "detail": "GXEON Local Bridge started in local_only security mode",
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


ADAPTERS_CATALOG = [
    {
        "id": "rustchain",
        "name": "RustChain RTC Adapter",
        "network": "rustchain",
        "version": "1.0.0",
        "status": "partial",
        "capabilities": ["WATCH_ONLY"],
        "description": "Native watch-only bounty receiver for RustChain (RTC). RPC node query not configured.",
    },
    {
        "id": "evm-metamask",
        "name": "MetaMask / EIP-1193 EVM Adapter",
        "network": "evm",
        "version": "1.0.0",
        "status": "active",
        "capabilities": ["CONNECT", "READ_BALANCE", "WATCH_ONLY"],
        "supported_chains": ["Ethereum Mainnet", "Base", "Polygon", "Arbitrum One"],
        "description": "Browser provider connector for EVM chains. Keys never leave the wallet.",
    },
    {
        "id": "coinbase-wallet",
        "name": "Coinbase Wallet Adapter",
        "network": "evm",
        "version": "1.0.0",
        "status": "partial",
        "capabilities": ["CONNECT", "WATCH_ONLY"],
        "description": "Dedicated Coinbase Wallet extension connector. Separate from custodial exchange APIs.",
    },
    {
        "id": "solana",
        "name": "Solana Adapter",
        "network": "solana",
        "version": "0.1.0",
        "status": "coming_soon",
        "capabilities": ["WATCH_ONLY"],
        "description": "Planned non-custodial Solana cluster monitor.",
    },
]


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "gxeon-wallet-local-bridge",
        "bind": "127.0.0.1",
        "port": 8790,
        "security_mode": "local_only",
        "version": "1.0.0",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@app.get("/status")
def status():
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
        "uptime": "active",
    }


@app.get("/wallets")
def wallets():
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
def wallet(wallet_id: str):
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
def adapters():
    return {"adapters": ADAPTERS_CATALOG, "count": len(ADAPTERS_CATALOG)}


@app.get("/capabilities")
def capabilities():
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
                "name": "SIGN",
                "description": "Cryptographic proof of ownership or message signature via local plane",
                "status": "guarded_manual",
            },
            {
                "name": "SEND",
                "description": "Broadcast on-chain funds movement (DISABLED in V1 for safety)",
                "status": "disabled_in_v1",
            },
        ]
    }


@app.get("/audit")
def audit():
    return {"audit_events": AUDIT_LOG[-50:]}


# Safety guards for future transaction endpoints (Disabled in V1)
@app.post("/prepare-transaction")
def prepare_transaction():
    raise HTTPException(
        status_code=403,
        detail="Transaction preparation is disabled in V1. GXEON is operating in Watch-Only / Monitoring mode.",
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
        detail="Broadcast is disabled in V1. No funds movement permitted.",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8790)
