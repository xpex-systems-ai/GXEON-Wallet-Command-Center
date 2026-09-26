from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
REGISTRY = BASE_DIR / "config" / "wallets.json"

app = FastAPI(title="GXEON Wallet Local Bridge", version="0.1.0")


def load_registry() -> dict[str, Any]:
    if not REGISTRY.exists():
        return {"version": 1, "wallets": []}
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "gxeon-wallet-local-bridge",
        "bind": "127.0.0.1",
        "security_mode": "local_only",
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
            "mode": w.get("mode"),
            "ownership_verified": bool(w.get("ownership_verified", False)),
            "purpose": w.get("purpose"),
        })
    return {"wallets": safe}


@app.get("/wallets/{wallet_id}")
def wallet(wallet_id: str):
    for w in load_registry().get("wallets", []):
        if w.get("id") == wallet_id:
            return {
                "id": w.get("id"),
                "name": w.get("name"),
                "network": w.get("network"),
                "symbol": w.get("symbol"),
                "address": w.get("address"),
                "mode": w.get("mode"),
                "ownership_verified": bool(w.get("ownership_verified", False)),
                "purpose": w.get("purpose"),
                "notes": w.get("notes"),
            }
    raise HTTPException(status_code=404, detail="wallet not found")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8790)
