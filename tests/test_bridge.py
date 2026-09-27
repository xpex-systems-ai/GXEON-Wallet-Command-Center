from __future__ import annotations

from fastapi.testclient import TestClient
from bridge import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["bind"] == "127.0.0.1"
    assert data["security_mode"] == "local_only"
    assert "version" in data


def test_status_endpoint():
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert data["security_invariants"]["no_private_keys"] is True
    assert data["security_invariants"]["bind_host"] == "127.0.0.1"
    assert data["security_invariants"]["send_enabled"] is False


def test_wallets_endpoint_and_invariants():
    response = client.get("/wallets")
    assert response.status_code == 200
    data = response.json()
    assert "wallets" in data
    assert len(data["wallets"]) >= 1

    # Check the RustChain initial wallet
    rtc_wallet = next((w for w in data["wallets"] if w["id"] == "rustchain-main"), None)
    assert rtc_wallet is not None
    assert rtc_wallet["address"] == "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"
    assert rtc_wallet["mode"] == "watch_only"
    assert rtc_wallet["ownership_verified"] is False
    assert rtc_wallet["symbol"] == "RTC"

    # Absolute security assertion: no private keys in output
    for w in data["wallets"]:
        assert "privateKey" not in w
        assert "private_key" not in w
        assert "seed" not in w
        assert "mnemonic" not in w


def test_wallet_by_id():
    response = client.get("/wallets/rustchain-main")
    assert response.status_code == 200
    wallet = response.json()
    assert wallet["id"] == "rustchain-main"
    assert wallet["ownership_verified"] is False

    response_404 = client.get("/wallets/non-existent-id")
    assert response_404.status_code == 404


def test_adapters_endpoint():
    response = client.get("/adapters")
    assert response.status_code == 200
    data = response.json()
    assert "adapters" in data
    adapter_ids = [a["id"] for a in data["adapters"]]
    assert "rustchain" in adapter_ids
    assert "evm-metamask" in adapter_ids
    assert "coinbase-wallet" in adapter_ids
    assert "solana" in adapter_ids


def test_capabilities_endpoint():
    response = client.get("/capabilities")
    assert response.status_code == 200
    data = response.json()
    caps = [c["name"] for c in data["capabilities"]]
    assert "READ_BALANCE" in caps
    assert "READ_TRANSACTIONS" in caps
    assert "CONNECT" in caps
    assert "WATCH_ONLY" in caps
    assert "SIGN" in caps
    assert "SEND" in caps


def test_audit_endpoint():
    response = client.get("/audit")
    assert response.status_code == 200
    data = response.json()
    assert "audit_events" in data
    assert len(data["audit_events"]) >= 1


def test_disabled_signing_and_broadcast_in_v1():
    res_prep = client.post("/prepare-transaction")
    assert res_prep.status_code == 403

    res_sign = client.post("/sign-transaction")
    assert res_sign.status_code == 403

    res_send = client.post("/broadcast")
    assert res_send.status_code == 403
