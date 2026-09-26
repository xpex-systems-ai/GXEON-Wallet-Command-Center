# CLI Tool Detection Engine (V1.1)

The CLI Tool Detection Engine inspects the operator's local development environment to identify installed command-line utilities and active wallet public addresses.

---

## 1. Security Safeguards

1. **Strict Allowlist:**
   - Only explicitly registered tools can be probed.
   - Arbitrary commands or user-supplied execution strings are rejected.
   - The allowlist currently contains:
     - `rustchain` (RustChain CLI)
     - `solana` (Solana CLI)
     - `git` (Git Version Control)
     - `python` / `python3` (Python Interpreter)
     - `node` (Node.js Runtime)

2. **No Arbitrary Shell Execution (`shell=False`):**
   - Subprocess calls are made strictly with fixed argument arrays (e.g. `[binary_path, "--version"]`).
   - `shell=True` is prohibited across the entire codebase to prevent command injection.

3. **Non-Destructive & Read-Only:**
   - Only informative commands (`--version`, `address`, `config get`) are executed.
   - No state-modifying, key-generating, or transaction-broadcasting commands are invoked.

4. **Sanitized Output:**
   - Absolute filesystem paths are checked and reported without exposing sensitive operator secrets.

---

## 2. Supported Tool Specifications

| Tool Identifier | Binary Name | Version Flag | Discovered Capabilities |
|---|---|---|---|
| `rustchain` | `rustchain` | `--version` | `READ_BALANCE`, `WATCH_ONLY` |
| `solana` | `solana` | `--version` | `READ_BALANCE`, `WATCH_ONLY` |
| `git` | `git` | `--version` | `AUDIT_LOG_EXPORT` |
| `python` | `python` / `python3` | `--version` | `LOCAL_COMPANION_RUNTIME` |
| `node` | `node` | `--version` | `FRONTEND_BUILD_RUNTIME` |
