from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient
from bridge import (
    app,
    PAIRING_STORE,
    PAIRING_CODE_TTL_SECONDS,
    MAX_PAIRING_ATTEMPTS,
    ALLOWED_ORIGINS,
    ALLOWLISTED_TOOLS,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_pairing_state():
    """Reset pairing store before every test."""
    PAIRING_STORE.code = None
    PAIRING_STORE.created_at = 0.0
    PAIRING_STORE.attempts = 0
    PAIRING_STORE.sessions.clear()
    yield


# ============================================================
# HEALTH & CORS SECURITY TESTS
# ============================================================

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["bind"] == "127.0.0.1"
    assert data["security_mode"] == "local_only"
    assert data["version"] == "1.1.0"


def test_status_endpoint():
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert data["security_invariants"]["no_private_keys"] is True
    assert data["security_invariants"]["bind_host"] == "127.0.0.1"
    assert data["security_invariants"]["send_enabled"] is False


def test_cors_production_origin_allowed():
    prod_origin = "https://studio-1105349706-f3598.web.app"
    assert prod_origin in ALLOWED_ORIGINS

    response = client.options(
        "/health",
        headers={
            "Origin": prod_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == prod_origin


def test_cors_wildcard_absent():
    assert "*" not in ALLOWED_ORIGINS


# ============================================================
# PAIRING PROTOCOL TESTS
# ============================================================

def test_pair_start_generates_valid_6_digit_code():
    res = client.post("/pair/start")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    code = data["pairing_code"]
    assert len(code) == 6
    assert code.isdigit()
    assert data["expires_in"] == PAIRING_CODE_TTL_SECONDS
    assert PAIRING_STORE.code == code


def test_pair_confirm_valid_flow():
    # 1. Start pairing
    res_start = client.post("/pair/start")
    code = res_start.json()["pairing_code"]

    # 2. Confirm pairing with correct code
    res_confirm = client.post("/pair/confirm", json={"code": code})
    assert res_confirm.status_code == 200
    data = res_confirm.json()
    assert data["ok"] is True
    assert "token" in data
    assert len(data["token"]) >= 32
    assert "session_id" in data

    token = data["token"]

    # 3. Check status
    res_status = client.get("/pair/status", headers={"Authorization": f"Bearer {token}"})
    assert res_status.status_code == 200
    assert res_status.json()["paired"] is True


def test_pair_confirm_invalid_code():
    client.post("/pair/start")
    res_confirm = client.post("/pair/confirm", json={"code": "000000"})
    assert res_confirm.status_code == 400
    assert "Invalid pairing code" in res_confirm.json()["detail"]


def test_pair_retry_limit():
    client.post("/pair/start")
    for _ in range(MAX_PAIRING_ATTEMPTS):
        client.post("/pair/confirm", json={"code": "000000"})

    # 6th attempt must be blocked with 429 / invalidated code
    res_exceeded = client.post("/pair/confirm", json={"code": "000000"})
    assert res_exceeded.status_code in (400, 429)
    assert PAIRING_STORE.code is None


def test_pair_expiry():
    client.post("/pair/start")
    # Simulate time passing past TTL
    PAIRING_STORE.created_at = time.time() - (PAIRING_CODE_TTL_SECONDS + 10)

    res_confirm = client.post("/pair/confirm", json={"code": PAIRING_STORE.code or "123456"})
    assert res_confirm.status_code == 400
    assert "expired" in res_confirm.json()["detail"].lower()


def test_pair_revoke():
    res_start = client.post("/pair/start")
    code = res_start.json()["pairing_code"]
    res_confirm = client.post("/pair/confirm", json={"code": code})
    token = res_confirm.json()["token"]

    res_revoke = client.post("/pair/revoke", headers={"Authorization": f"Bearer {token}"})
    assert res_revoke.status_code == 200
    assert res_revoke.json()["ok"] is True

    # Token is now revoked
    res_protected = client.get("/wallets", headers={"Authorization": f"Bearer {token}"})
    assert res_protected.status_code == 403


# ============================================================
# PROTECTED ENDPOINTS AUTH TESTS
# ============================================================

def test_protected_endpoints_require_token():
    # Without token -> 401
    assert client.get("/wallets").status_code == 401
    assert client.get("/wallets/rustchain-main").status_code == 401
    assert client.get("/adapters").status_code == 401
    assert client.get("/capabilities").status_code == 401
    assert client.get("/detect").status_code == 401
    assert client.get("/cli/status").status_code == 401
    assert client.get("/wallets/rustchain-main/balance").status_code == 401
    assert client.get("/wallets/rustchain-main/transactions").status_code == 401


def test_protected_endpoints_succeed_with_token():
    res_start = client.post("/pair/start")
    token = client.post("/pair/confirm", json={"code": res_start.json()["pairing_code"]}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    res_wallets = client.get("/wallets", headers=headers)
    assert res_wallets.status_code == 200
    assert "wallets" in res_wallets.json()

    res_adapters = client.get("/adapters", headers=headers)
    assert res_adapters.status_code == 200

    res_caps = client.get("/capabilities", headers=headers)
    assert res_caps.status_code == 200

    res_detect = client.get("/detect", headers=headers)
    assert res_detect.status_code == 200


# ============================================================
# TOOL & CLI DETECTION INVARIANTS
# ============================================================

def test_tool_detection_allowlist_and_safety():
    res_start = client.post("/pair/start")
    token = client.post("/pair/confirm", json={"code": res_start.json()["pairing_code"]}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/detect", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "tools" in data
    assert "detected_wallets" in data

    tool_names = [t["tool"] for t in data["tools"]]
    assert "RustChain CLI" in tool_names
    assert "Solana CLI" in tool_names
    assert "Git" in tool_names
    assert "Python" in tool_names
    assert "Node.js" in tool_names

    # Check that only allowed tools exist
    assert len(tool_names) == len(ALLOWLISTED_TOOLS)


# ============================================================
# RUSTCHAIN READ-ONLY TRUTH IN DATA TESTS
# ============================================================

def test_rustchain_live_balance_query():
    res_start = client.post("/pair/start")
    token = client.post("/pair/confirm", json={"code": res_start.json()["pairing_code"]}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/wallets/rustchain-main/balance", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["wallet_id"] == "rustchain-main"
    assert data["network"] == "rustchain"
    assert data["symbol"] == "RTC"
    assert data["address"] == "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"
    assert data["balance"] is None
    assert data["status"] == "UNAVAILABLE"
    assert data["ownership_verified"] is False
    assert data["mode"] == "watch_only"


def test_rustchain_transactions_query():
    res_start = client.post("/pair/start")
    token = client.post("/pair/confirm", json={"code": res_start.json()["pairing_code"]}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/wallets/rustchain-main/transactions", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["wallet_id"] == "rustchain-main"
    assert data["transactions"] == []
    assert data["status"] == "UNAVAILABLE"


# ============================================================
# DISABLED TRANSACTION ENDPOINTS (V1.1 SAFETY)
# ============================================================

def test_disabled_signing_and_broadcast_in_v1_1():
    assert client.post("/prepare-transaction").status_code == 403
    assert client.post("/sign-transaction").status_code == 403
    assert client.post("/broadcast").status_code == 403
