from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen
import subprocess

BASE_URL = "http://127.0.0.1:8790"
SESSION_CACHE_FILE = os.path.expanduser("~/.gxeon_cli_session.json")


def load_cached_token() -> str | None:
    if not os.path.exists(SESSION_CACHE_FILE):
        return None
    try:
        with open(SESSION_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("expires_at", 0) > time.time():
                return data.get("token")
    except Exception:
        pass
    return None


def save_cached_token(token: str, expires_in: int):
    try:
        with open(SESSION_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "token": token,
                "expires_at": time.time() + expires_in,
            }, f)
    except Exception:
        pass


def get(path: str, token: str | None = None):
    try:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = Request(BASE_URL + path, headers=headers)
        with urlopen(req, timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        if e.code in (401, 403):
            print(f"[AUTH ERROR] Endpoint {path} requires pairing. Run 'gxeon-wallet pair' or pass code.")
        else:
            print(f"[HTTP ERROR {e.code}] {e.reason}")
        sys.exit(1)
    except URLError as e:
        print(f"[ERROR] GXEON Local Companion offline at {BASE_URL}: {e}")
        print("Run 'gxeon-wallet serve' or 'python bridge.py' to start companion.")
        sys.exit(2)


def post(path: str, data: dict, token: str | None = None):
    try:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        body = json.dumps(data).encode("utf-8")
        req = Request(BASE_URL + path, data=body, headers=headers, method="POST")
        with urlopen(req, timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_msg)
            print(f"[ERROR {e.code}] {err_json.get('detail', err_msg)}")
        except Exception:
            print(f"[ERROR {e.code}] {err_msg}")
        sys.exit(1)
    except URLError as e:
        print(f"[ERROR] GXEON Local Companion offline at {BASE_URL}: {e}")
        sys.exit(2)


def cmd_serve(_):
    print("\nStarting GXEON Local Companion on 127.0.0.1:8790...")
    print("Zero-trust security mode: local_only. Private keys stay on device.\n")
    import uvicorn
    from bridge import app
    uvicorn.run(app, host="127.0.0.1", port=8790)


def cmd_pair(_):
    data = post("/pair/start", {})
    code = data.get("pairing_code")
    expires = data.get("expires_in", 300)
    print("\n" + "=" * 55)
    print("     GXEON LOCAL COMPANION — PAIRING CODE")
    print("=" * 55)
    print(f"\n   PAIRING CODE :  >>> {code} <<<\n")
    print(f"   Expires in   :  {expires // 60} minutes ({expires} seconds)")
    print("   Instructions :  Enter this 6-digit code in the GXEON Web")
    print("                   Command Center at: https://studio-1105349706-f3598.web.app\n")
    print("=" * 55 + "\n")


def cmd_status(_):
    data = get("/status")
    print("\n--- GXEON LOCAL COMPANION STATUS ---")
    print(f"System State       : {data.get('status', '').upper()}")
    print(f"Registered Wallets : {data.get('registered_wallets_count')}")
    print(f"Active Adapters    : {data.get('active_adapters')}")
    print("Security Invariants:")
    invariants = data.get("security_invariants", {})
    for k, v in invariants.items():
        print(f"  - {k}: {v}")
    print()


def cmd_detect(_):
    token = load_cached_token()
    data = get("/detect", token)
    tools = data.get("tools", [])
    wallets = data.get("detected_wallets", [])
    
    print("\n--- DETECTED LOCAL TOOLING & CLIs ---")
    print(f"{'TOOL':<20} | {'STATUS':<12} | {'VERSION / PATH'}")
    print("-" * 65)
    for t in tools:
        status_str = "DETECTED" if t.get("installed") else "NOT FOUND"
        v = t.get("version") or (t.get("path_sanitized") or "--")
        print(f"{t.get('tool', ''):<20} | {status_str:<12} | {v}")
    
    print(f"\n--- LOCALLY REGISTERED PUBLIC ADDRESSES ({len(wallets)}) ---")
    for w in wallets:
        print(f"  - [{w.get('network').upper()}] {w.get('name')}: {w.get('publicAddress')} ({w.get('mode')})")
    print()


def cmd_wallets(_):
    token = load_cached_token()
    data = get("/wallets", token)
    wallets = data.get("wallets", [])
    if not wallets:
        print("No wallets registered in local plane.")
        return
    print(f"\nRegistered Wallets ({len(wallets)} total):")
    print(f"{'ID':<18} | {'NETWORK':<12} | {'SYMBOL':<6} | {'MODE':<12} | {'OWNERSHIP':<12} | {'ADDRESS'}")
    print("-" * 105)
    for w in wallets:
        verified = "VERIFIED" if w.get("ownership_verified") else "UNVERIFIED"
        print(
            f"{w.get('id', ''):<18} | "
            f"{w.get('network', ''):<12} | "
            f"{w.get('symbol', ''):<6} | "
            f"{w.get('mode', ''):<12} | "
            f"{verified:<12} | "
            f"{w.get('address', '')}"
        )
    print()


def cmd_adapters(_):
    token = load_cached_token()
    data = get("/adapters", token)
    adapters = data.get("adapters", [])
    print(f"\nConfigured Adapters ({len(adapters)} total):")
    print(f"{'ID':<18} | {'NETWORK':<10} | {'STATUS':<12} | {'CAPABILITIES'}")
    print("-" * 90)
    for a in adapters:
        caps = ", ".join(a.get("capabilities", []))
        print(f"{a.get('id', ''):<18} | {a.get('network', ''):<10} | {a.get('status', ''):<12} | {caps}")
    print()


def cmd_balance(args):
    token = load_cached_token()
    print(f"\nQuerying on-chain balance for wallet: {args.wallet_id}")
    data = get(f"/wallets/{args.wallet_id}/balance", token)
    bal = data.get("balance")
    bal_str = f"{bal} {data.get('symbol')}" if bal is not None else "-- (UNAVAILABLE)"
    print(f"Network : {data.get('network')} ({data.get('symbol')})")
    print(f"Address : {data.get('address')}")
    print(f"Balance : {bal_str}")
    print(f"Status  : {data.get('status')}")
    print(f"Source  : {data.get('source')}")
    print(f"Queried : {data.get('queried_at')}")
    print(f"Note    : {data.get('note', '')}\n")


def cmd_transactions(args):
    token = load_cached_token()
    print(f"\nQuerying transactions for wallet: {args.wallet_id}")
    data = get(f"/wallets/{args.wallet_id}/transactions", token)
    txs = data.get("transactions", [])
    print(f"Network : {data.get('network')} ({data.get('symbol')})")
    print(f"Address : {data.get('address')}")
    print(f"Status  : {data.get('status')}")
    print(f"Source  : {data.get('source')}")
    print(f"Records : {len(txs)} verified transactions")
    print(f"Note    : {data.get('note', '')}\n")


def cmd_stop(_):
    print("To stop GXEON Local Companion, press Ctrl+C in the companion terminal.")


def main():
    p = argparse.ArgumentParser(
        prog="gxeon-wallet",
        description="GXEON Local Companion CLI V1.1 — Non-custodial pairing and wallet management",
    )
    sub = p.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Start local companion bridge on 127.0.0.1:8790")
    serve.set_defaults(func=cmd_serve)

    pair = sub.add_parser("pair", help="Generate secure 6-digit pairing code")
    pair.set_defaults(func=cmd_pair)

    status = sub.add_parser("status", help="Show companion status & security invariants")
    status.set_defaults(func=cmd_status)

    detect = sub.add_parser("detect", help="Detect allowlisted CLI tools and public wallets")
    detect.set_defaults(func=cmd_detect)

    wallets = sub.add_parser("wallets", help="List registered public wallet metadata")
    wallets.set_defaults(func=cmd_wallets)

    ad = sub.add_parser("adapters", help="List registered network adapters")
    ad.set_defaults(func=cmd_adapters)

    bal = sub.add_parser("balance", help="Inspect balance of a wallet")
    bal.add_argument("wallet_id", help="The wallet identifier")
    bal.set_defaults(func=cmd_balance)

    tx = sub.add_parser("transactions", help="Inspect transactions of a wallet")
    tx.add_argument("wallet_id", help="The wallet identifier")
    tx.set_defaults(func=cmd_transactions)

    stop = sub.add_parser("stop", help="Stop local companion")
    stop.set_defaults(func=cmd_stop)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
