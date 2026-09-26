# GXEON Local Companion V1.1 — Architecture & Operation

The **GXEON Local Companion** is the local execution bridge that runs directly on the operator's machine. It acts as the non-custodial link between local CLI developer tooling (RustChain CLI, Solana CLI, Git, etc.) and the GXEON Cloud Web Command Center.

---

## 1. Zero-Trust Security Invariants

1. **Strict Localhost Binding:**
   - The companion server binds exclusively to `127.0.0.1:8790`.
   - Binding to `0.0.0.0` or any external interface is strictly blocked in code.

2. **No Private Keys, Seeds, or Mnemonics:**
   - The companion only discovers and exposes public addresses and CLI tool availability.
   - Private keys and keystores remain in the local OS filesystem; they are never read, parsed, transmitted, or uploaded.

3. **CORS Invariant:**
   - CORS is restricted to production Firebase Hosting domains (`https://studio-1105349706-f3598.web.app`, `https://studio-1105349706-f3598.firebaseapp.com`) and local development origins (`http://localhost:5173`, etc.).
   - Wildcard (`*`) is prohibited.

4. **Ephemeral Pairing & Protected Endpoints:**
   - Unauthenticated access to wallet metadata or tool execution is blocked (HTTP 401/403).
   - All protected endpoints require a short-lived bearer session token issued during the 6-digit numeric pairing handshake.

5. **No Fund Movement in V1.1:**
   - Endpoints for transaction signing, key extraction, or arbitrary broadcast return HTTP 403 Forbidden.

---

## 2. API Endpoints

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/health` | `GET` | No | Basic health check and uptime probe |
| `/status` | `GET` | No | Bridge status, invariants, and version info |
| `/pair/start` | `POST` | No | Generates 6-digit pairing code (TTL: 5 min) |
| `/pair/confirm` | `POST` | No | Validates 6-digit code, returns 1-hour session token |
| `/pair/status` | `GET` | Yes (Bearer) | Returns active pairing session info |
| `/pair/revoke` | `POST` | Yes (Bearer) | Revokes active session token immediately |
| `/detect` | `GET` | Yes (Bearer) | Scans for allowlisted CLI tools and local public addresses |
| `/wallets` | `GET` | Yes (Bearer) | Lists discovered local public wallets |
| `/wallets/{id}` | `GET` | Yes (Bearer) | Retrieves details for a specific local wallet |
| `/adapters` | `GET` | Yes (Bearer) | Returns active adapter capability matrix |
| `/wallets/{id}/balance` | `GET` | Yes (Bearer) | Queries read-only live balance for local wallet |
| `/wallets/{id}/transactions`| `GET` | Yes (Bearer) | Queries read-only live transaction history |
| `/send` | `POST` | N/A | HTTP 403 Forbidden (Disabled in V1.1) |
| `/sign` | `POST` | N/A | HTTP 403 Forbidden (Disabled in V1.1) |
| `/broadcast` | `POST` | N/A | HTTP 403 Forbidden (Disabled in V1.1) |

---

## 3. Quick Start

### Windows (One-Click)
Double-click `Start-GXEON-Companion.cmd` or execute:
```powershell
.\scripts\Start-GXEON-Companion.ps1
```

### Manual CLI Start
```bash
python bridge.py
```
Or start via the companion CLI:
```bash
python gxeon_wallet.py serve
```
