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
            print(f"[AUTH ERROR] Endpoint {path} requires pairing. Run 'python gxeon_wallet.py pair'.")
        else:
            print(f"[HTTP ERROR {e.code}] {e.reason}")
        sys.exit(1)
    except URLError as e:
        print(f"[ERROR] GXEON Local Companion offline at {BASE_URL}: {e}")
        print("Run 'gxeon-wallet serve' or 'python bridge.py' to start companion.")
        sys.exit(2)


def post(path: str, data: dict, token: str | None = None, timeout: int = 4):
    try:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        body = json.dumps(data).encode("utf-8")
        req = Request(BASE_URL + path, data=body, headers=headers, method="POST")
        with urlopen(req, timeout=timeout) as r:
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
    print("     GXEON LOCAL COMPANION — CLI PAIRING")
    print("=" * 55)
    print(f"\n   ONE-TIME CODE :  >>> {code} <<<\n")
    print(f"   Expires in    :  {expires // 60} minutes ({expires} seconds)")
    print("   Re-enter the displayed code below to authorize this local CLI session.")
    entered = input("   CODE: ").strip()
    if entered != str(code):
        print("[PAIRING ABORTED] Code did not match.")
        return
    confirmed = post("/pair/confirm", {"code": entered})
    token = confirmed.get("token")
    if not token:
        print("[PAIRING FAILED] Companion did not issue a session token.")
        return
    save_cached_token(token, int(confirmed.get("expires_in", 3600)))
    print(f"\n   CLI paired successfully. Session: {confirmed.get('session_id')}")
    print("   Token stored only in the local user session cache and expires automatically.\n")
    print("=" * 55 + "\n")


def cmd_status(_):
    data = get("/status")
    print("\n--- GXEON LOCAL COMPANION STATUS ---")
    print(f"System State       : {data.get('status', '').upper()}")
    print(f"Mining State       : {data.get('mining_status', 'UNKNOWN')}")
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
    registered = data.get("registered_wallets", [])
    
    print("\n--- DETECTED LOCAL TOOLING & CLIs ---")
    print(f"{'TOOL':<18} | {'STATUS':<12} | {'PUBKEY DISCOVERY':<18} | {'VERSION / PATH'}")
    print("-" * 80)
    for t in tools:
        status_str = "DETECTED" if t.get("installed") else "NOT FOUND"
        disc = t.get("public_address_discovery", "UNAVAILABLE")
        v = t.get("version") or (t.get("path_sanitized") or "--")
        print(f"{t.get('tool', ''):<18} | {status_str:<12} | {disc:<18} | {v}")
    
    if wallets:
        print(f"\n--- LIVE DETECTED CLI WALLETS ({len(wallets)}) ---")
        for w in wallets:
            print(f"  - [{w.get('network').upper()}] {w.get('name')}: {w.get('publicAddress')} ({w.get('mode')})")
    
    if registered:
        print(f"\n--- REGISTERED WATCH-ONLY CONFIGS ({len(registered)}) ---")
        for w in registered:
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


# Mining commands
def cmd_mining_status(_):
    token = load_cached_token()
    data = get("/mining/status", token)
    print("\n--- CLAWRTC PROOF OF ANTIQUITY MINING STATUS ---")
    print(f"Status            : {data.get('status')}")
    print(f"ClawRTC Installed : {data.get('clawrtc_installed')}")
    print(f"ClawRTC Version   : {data.get('clawrtc_version') or 'Not installed'}")
    print(f"Miner ID          : {data.get('miner_id') or 'NOT_CONFIGURED'}")
    print(f"Attestation State : {data.get('attestation_state')}")
    print(f"Current Epoch     : {data.get('current_epoch')}")
    mult = data.get("antiquity_multiplier")
    print(f"Antiquity Mult.   : {mult if mult is not None else '-- (Awaiting on-chain proof)'}")
    print(f"Confirmed RTC     : {data.get('confirmed_rtc')}")
    print(f"Pending Rewards   : {data.get('pending_rewards')}")
    print("Hardware Metadata :")
    for k, v in data.get("hardware", {}).items():
        print(f"  - {k}: {v}")
    print()


def cmd_mining_start(_):
    token = load_cached_token()
    print("\nStarting ClawRTC Proof of Antiquity mining...")
    res = post("/mining/start", {}, token)
    print(f"Result : {res.get('message')}")
    print(f"Status : {res.get('status')}\n")


def cmd_mining_stop(_):
    token = load_cached_token()
    print("\nStopping ClawRTC mining...")
    res = post("/mining/stop", {}, token, timeout=12)
    print(f"Result : {res.get('message')}")
    print(f"Status : {res.get('status')}\n")


def cmd_mining_configure(args):
    token = load_cached_token()
    payload = {"miner_id": args.miner_id}
    if args.destination:
        payload["reward_destination"] = args.destination
    res = post("/mining/configure", payload, token)
    print(f"\nMiner identity configured: {res.get('miner_id')}")
    if res.get("reward_destination"):
        print(f"Reward destination : {res.get('reward_destination')}")
    print()


def cmd_stop(_):
    print("To stop GXEON Local Companion, press Ctrl+C in the companion terminal.")


def main():
    p = argparse.ArgumentParser(
        prog="gxeon-wallet",
        description="GXEON Local Companion CLI V1.2 — Quantum Core, ClawRTC Proof of Antiquity & Wallet Operations",
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

    # Mining subcommands
    mining_p = sub.add_parser("mining", help="Proof of Antiquity & ClawRTC mining commands")
    mining_sub = mining_p.add_subparsers(dest="mining_cmd", required=True)

    m_status = mining_sub.add_parser("status", help="Show mining & Proof of Antiquity status")
    m_status.set_defaults(func=cmd_mining_status)

    m_start = mining_sub.add_parser("start", help="Start mining engine")
    m_start.set_defaults(func=cmd_mining_start)

    m_stop = mining_sub.add_parser("stop", help="Stop mining engine")
    m_stop.set_defaults(func=cmd_mining_stop)

    m_cfg = mining_sub.add_parser("configure", help="Configure miner identity")
    m_cfg.add_argument("miner_id", help="The unique RustChain miner ID")
    m_cfg.add_argument("--destination", help="Optional reward destination wallet address")
    m_cfg.set_defaults(func=cmd_mining_configure)

    # RustChain subcommands
    rtc_p = sub.add_parser("rustchain", help="RustChain live queries")
    rtc_sub = rtc_p.add_subparsers(dest="rtc_cmd", required=True)

    rtc_status = rtc_sub.add_parser("status", help="Query RustChain status")
    rtc_status.set_defaults(func=lambda _: print("\nRustChain Network Status: UNAVAILABLE (No official RPC configured)\n"))

    rtc_bal = rtc_sub.add_parser("balance", help="Query RustChain wallet balance")
    rtc_bal.add_argument("wallet_id", default="rustchain-main", nargs="?", help="Wallet ID")
    rtc_bal.set_defaults(func=cmd_balance)

    rtc_tx = rtc_sub.add_parser("history", help="Query RustChain transaction history")
    rtc_tx.add_argument("wallet_id", default="rustchain-main", nargs="?", help="Wallet ID")
    rtc_tx.set_defaults(func=cmd_transactions)

    stop = sub.add_parser("stop", help="Stop local companion")
    stop.set_defaults(func=cmd_stop)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
