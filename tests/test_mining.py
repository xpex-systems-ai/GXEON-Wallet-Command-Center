from __future__ import annotations

import time
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from bridge import (
    app,
    PAIRING_STORE,
    MINING_STORE,
    get_hardware_metadata,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_bridge_state():
    """Reset pairing store and mining state before every test."""
    PAIRING_STORE.code = None
    PAIRING_STORE.created_at = 0.0
    PAIRING_STORE.attempts = 0
    PAIRING_STORE.sessions.clear()

    MINING_STORE.status = "STOPPED"
    MINING_STORE.miner_id = None
    MINING_STORE.reward_destination = "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"
    MINING_STORE.antiquity_multiplier = None
    MINING_STORE.last_attestation_status = "NOT_SUBMITTED"
    MINING_STORE.current_epoch = None
    MINING_STORE.total_mined_rtc = None
    MINING_STORE.pending_rewards_count = 0
    yield


def _obtain_session_token() -> str:
    """Helper to start pairing via local CLI and confirm via UI to get valid session token."""
    res_start = client.post("/pair/start")
    code = res_start.json()["pairing_code"]
    res_confirm = client.post("/pair/confirm", json={"code": code})
    return res_confirm.json()["token"]


# ============================================================
# HARDWARE METADATA & CLAWRTC TOOL TESTS
# ============================================================

def test_hardware_metadata_collection():
    metadata = get_hardware_metadata()
    assert "cpu_arch" in metadata
    assert "processor" in metadata
    assert "os" in metadata
    assert "compatibility" in metadata


# ============================================================
# MINING ENDPOINTS AUTHENTICATION & ACCESS CONTROL
# ============================================================

def test_mining_status_paired():
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/mining/status", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "miner_id" in data
    assert "reward_destination" in data
    assert "clawrtc_installed" in data
    assert "hardware" in data
    # Invariant: RTC public address is separate from miner_id
    assert data["reward_destination"] == "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"


def test_mining_configure_requires_auth():
    # Without Authorization header -> 401
    res = client.post("/mining/configure", json={"miner_id": "test-miner-01"})
    assert res.status_code == 401

    # With invalid token -> 403
    res_bad = client.post(
        "/mining/configure",
        headers={"Authorization": "Bearer invalid_token_123"},
        json={"miner_id": "test-miner-01"},
    )
    assert res_bad.status_code == 403


def test_mining_start_stop_requires_auth():
    # Start without auth -> 401
    res_start = client.post("/mining/start")
    assert res_start.status_code == 401

    # Stop without auth -> 401
    res_stop = client.post("/mining/stop")
    assert res_stop.status_code == 401


# ============================================================
# MINING LIFECYCLE WITH VALID PAIRING SESSION
# ============================================================

def test_mining_configure_and_start_lifecycle():
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Configure miner identity and reward destination
    conf_res = client.post(
        "/mining/configure",
        headers=headers,
        json={
            "miner_id": "node-alpha-101",
            "reward_destination": "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269",
        },
    )
    assert conf_res.status_code == 200
    conf_data = conf_res.json()
    assert conf_data["ok"] is True
    assert conf_data["miner_id"] == "node-alpha-101"
    assert conf_data["reward_destination"] == "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"

    # 2. Start Mining
    start_res = client.post("/mining/start", headers=headers)
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert start_data["ok"] is True
    assert start_data["status"] == "MINING"
    assert start_data["miner_id"] == "node-alpha-101"

    # 3. Verify status reflects active mining
    status_res = client.get("/mining/status", headers=headers)
    status_data = status_res.json()
    assert status_data["status"] == "MINING"
    assert status_data["miner_id"] == "node-alpha-101"

    # 4. Stop Mining
    stop_res = client.post("/mining/stop", headers=headers)
    assert stop_res.status_code == 200
    stop_data = stop_res.json()
    assert stop_data["ok"] is True
    assert stop_data["status"] == "STOPPED"

    # 5. Verify status reflects stopped
    status_res2 = client.get("/mining/status", headers=headers)
    assert status_res2.json()["status"] == "STOPPED"


def test_detect_tools_includes_clawrtc():
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}

    with patch("shutil.which") as mock_which:
        mock_which.side_effect = lambda tool: f"C:\\bin\\{tool}.exe" if tool == "clawrtc" else None

        with patch("subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.returncode = 0
            mock_proc.stdout = "clawrtc v0.9.4-antiquity"
            mock_run.return_value = mock_proc

            res = client.get("/detect", headers=headers)
            assert res.status_code == 200
            data = res.json()
            tool_names = [t["tool"] for t in data["tools"]]
            assert "ClawRTC" in tool_names
            clawrtc_item = next(t for t in data["tools"] if t["tool"] == "ClawRTC")
            assert clawrtc_item["installed"] is True
            assert "v0.9.4" in clawrtc_item["version"]
