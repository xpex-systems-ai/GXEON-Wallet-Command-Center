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
    import bridge
    bridge.MINER_PROCESS = None

    PAIRING_STORE.code = None
    PAIRING_STORE.created_at = 0.0
    PAIRING_STORE.attempts = 0
    PAIRING_STORE.sessions.clear()

    MINING_STORE.status = "NOT_INSTALLED"
    MINING_STORE.miner_id = None
    MINING_STORE.reward_destination = "RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269"
    MINING_STORE.config_source = "UNCONFIGURED"
    MINING_STORE.antiquity_multiplier = None
    MINING_STORE.last_attestation_status = "NOT_SUBMITTED"
    MINING_STORE.last_attestation_timestamp = None
    MINING_STORE.current_epoch = None
    MINING_STORE.confirmed_rtc = None
    MINING_STORE.pending_rewards = None
    MINING_STORE.estimated_rewards = None
    MINING_STORE.pid = None
    MINING_STORE.started_at = None
    MINING_STORE.exit_code = None
    yield

    # Clean up any lingering subprocess
    if bridge.MINER_PROCESS is not None:
        try:
            bridge.MINER_PROCESS.kill()
        except Exception:
            pass
        bridge.MINER_PROCESS = None


def _obtain_session_token() -> str:
    """Helper to start pairing via local CLI and confirm via UI to get valid session token."""
    res_start = client.post("/pair/start")
    code = res_start.json()["pairing_code"]
    res_confirm = client.post("/pair/confirm", json={"code": code})
    return res_confirm.json()["token"]


# ============================================================
# HARDWARE METADATA & CLAWRTC TOOL TESTS
# ============================================================

def test_hardware_metadata_truthfulness():
    """Hardware metadata must NOT falsely claim compatibility with Proof of Antiquity."""
    metadata = get_hardware_metadata()
    assert "cpu_arch" in metadata
    assert "processor" in metadata
    assert "os" in metadata
    assert "compatibility" in metadata
    assert metadata["compatibility"] in ("DETECTED_HARDWARE", "UNKNOWN")
    assert "Compatible with Proof of Antiquity" not in metadata["compatibility"]


# ============================================================
# MINING ENDPOINTS AUTHENTICATION & TRUTHFUL DEFAULTS
# ============================================================

def test_mining_status_truthful_defaults():
    """
    CRITICAL INVARIANT:
    Status defaults must be None/null, not synthetic 42 epoch or 0.0 fake balance.
    """
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
    assert data["current_epoch"] is None
    assert data["confirmed_rtc"] is None
    assert data["pending_rewards"] is None
    assert data["estimated_rewards"] is None
    assert data["antiquity_multiplier"] is None
    # Public destination address separate from miner_id
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
# MONEY TRUTH: BLOCKING INVALID MINING TRANSITIONS
# ============================================================

def test_mining_start_blocked_when_clawrtc_not_installed():
    """If ClawRTC binary is missing, /mining/start must return HTTP 409 NOT_INSTALLED."""
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}

    with patch("shutil.which", return_value=None):
        MINING_STORE.miner_id = "miner-test-01"
        res = client.post("/mining/start", headers=headers)
        assert res.status_code == 409
        assert "NOT_INSTALLED" in res.json()["detail"]
        assert MINING_STORE.status == "NOT_INSTALLED"
        assert MINING_STORE.last_attestation_status != "ATTESTED"


def test_mining_start_blocked_when_miner_id_not_configured():
    """If miner_id is missing, /mining/start must return HTTP 400 NOT_CONFIGURED."""
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}

    with patch("shutil.which", return_value="C:\\bin\\clawrtc.exe"):
        MINING_STORE.miner_id = None
        res = client.post("/mining/start", headers=headers)
        assert res.status_code == 400
        assert "NOT_CONFIGURED" in res.json()["detail"]
        assert MINING_STORE.status == "NOT_CONFIGURED"


# ============================================================
# MINING LIFECYCLE & PROCESS TRACKING
# ============================================================

def test_mining_lifecycle_with_mocked_process():
    """
    Verifies full lifecycle:
    1. configure miner_id
    2. start miner with real/mocked process
    3. verify status=MINING, attestation=UNATTESTED, pid tracked, process_alive=True
    4. stop miner -> status=STOPPED, pid cleared, process_alive=False
    """
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

    # Mock running process
    mock_proc = MagicMock()
    mock_proc.pid = 9876
    mock_proc.poll.return_value = None  # Process is running

    with patch("shutil.which", return_value="C:\\bin\\clawrtc.exe"):
        with patch("subprocess.Popen", return_value=mock_proc):
            # 2. Start Mining
            start_res = client.post("/mining/start", headers=headers)
            assert start_res.status_code == 200
            start_data = start_res.json()
            assert start_data["ok"] is True
            assert start_data["status"] == "MINING"
            assert start_data["pid"] == 9876

            # 3. Verify status reflects active mining and UNATTESTED (no fake ATTESTED)
            status_res = client.get("/mining/status", headers=headers)
            status_data = status_res.json()
            assert status_data["status"] == "MINING"
            assert status_data["pid"] == 9876
            assert status_data["process_alive"] is True
            assert status_data["attestation_state"] == "UNATTESTED"

            # 4. Stop Mining
            stop_res = client.post("/mining/stop", headers=headers)
            assert stop_res.status_code == 200
            assert stop_res.json()["ok"] is True

            # 5. Verify status reflects stopped
            status_res2 = client.get("/mining/status", headers=headers)
            status_data2 = status_res2.json()
            assert status_data2["status"] == "STOPPED"
            assert status_data2["pid"] is None
            assert status_data2["process_alive"] is False


def test_missing_clawrtc_stays_not_installed_even_with_miner_id_metadata():
    """
    CRITICAL INVARIANT:
    If miner_id metadata is configured but ClawRTC binary is missing:
    - status must remain NOT_INSTALLED
    - config_source must be LOCAL_METADATA_CONFIGURED
    """
    token = _obtain_session_token()
    headers = {"Authorization": f"Bearer {token}"}

    with patch("shutil.which", return_value=None):
        conf_res = client.post(
            "/mining/configure",
            headers=headers,
            json={"miner_id": "persisted-metadata-miner-01"},
        )
        assert conf_res.status_code == 200
        conf_data = conf_res.json()
        assert conf_data["config_source"] == "LOCAL_METADATA_CONFIGURED"

        # Check status endpoint
        status_res = client.get("/mining/status", headers=headers)
        status_data = status_res.json()
        assert status_data["status"] == "NOT_INSTALLED"
        assert status_data["config_source"] == "LOCAL_METADATA_CONFIGURED"
        assert status_data["miner_id"] == "persisted-metadata-miner-01"
        assert status_data["clawrtc_installed"] is False


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

