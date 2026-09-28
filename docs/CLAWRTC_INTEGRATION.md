# CLAWRTC INTEGRATION GUIDE — V1.2

## Overview
ClawRTC is the first-class hardware attestation and mining engine for the RustChain ecosystem.

## Safe Detection Protocol
The Local Companion bridge detects ClawRTC using safe, unescaped process invocation:
- Detection method: `shutil.which("clawrtc")` or `shutil.which("clawrtc-cli")`
- Version retrieval: `subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=3, shell=False)`
- Security: `shell=False` is strictly enforced. No user-supplied parameters are passed to subprocess execution.

## Endpoints
- `GET /mining/status` — Retrieves status, hardware metadata, and attestation level.
- `POST /mining/configure` — Configures `miner_id` and `reward_destination` (guarded by Bearer session token).
- `POST /mining/start` — Triggers local mining process (guarded by Bearer session token).
- `POST /mining/stop` — Halts active mining process (guarded by Bearer session token).
