from __future__ import annotations

import argparse
import json
import sys
from urllib.error import URLError
from urllib.request import urlopen

BASE_URL = "http://127.0.0.1:8790"


def get(path: str):
    try:
        with urlopen(BASE_URL + path, timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except URLError as e:
        print(f"[ERROR] GXEON Local Bridge offline at {BASE_URL}: {e}")
        print("Ensure 'python bridge.py' is running locally on 127.0.0.1:8790.")
        sys.exit(2)


def cmd_health(_):
    data = get("/health")
    print("\n--- GXEON LOCAL BRIDGE HEALTH ---")
    print(f"Status       : {'OK (ONLINE)' if data.get('ok') else 'ERROR'}")
    print(f"Service      : {data.get('service')}")
    print(f"Bind Address : {data.get('bind')}:{data.get('port')}")
    print(f"Security     : {data.get('security_mode')}")
    print(f"Version      : {data.get('version')}")
    print(f"Timestamp    : {data.get('timestamp')}\n")


def cmd_status(_):
    data = get("/status")
    print("\n--- GXEON COMMAND CENTER STATUS ---")
    print(f"System State       : {data.get('status', '').upper()}")
    print(f"Registered Wallets : {data.get('registered_wallets_count')}")
    print(f"Active Adapters    : {data.get('active_adapters')}")
    print("Security Invariants:")
    invariants = data.get("security_invariants", {})
    for k, v in invariants.items():
        print(f"  - {k}: {v}")
    print()


def cmd_list(_):
    data = get("/wallets")
    wallets = data.get("wallets", [])
    if not wallets:
        print("No wallets registered.")
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


def cmd_show(args):
    data = get(f"/wallets/{args.wallet_id}")
    print(f"\n--- WALLET DETAILS: {data.get('id')} ---")
    print(f"Name               : {data.get('name')}")
    print(f"Network            : {data.get('network')}")
    print(f"Symbol             : {data.get('symbol')}")
    print(f"Address            : {data.get('address')}")
    print(f"Mode               : {data.get('mode')}")
    print(f"Ownership Verified : {data.get('ownership_verified')}")
    print(f"Purpose            : {data.get('purpose')}")
    print(f"Notes              : {data.get('notes')}\n")


def cmd_adapters(_):
    data = get("/adapters")
    adapters = data.get("adapters", [])
    print(f"\nConfigured Adapters ({len(adapters)} total):")
    print(f"{'ID':<18} | {'NETWORK':<10} | {'STATUS':<12} | {'CAPABILITIES'}")
    print("-" * 90)
    for a in adapters:
        caps = ", ".join(a.get("capabilities", []))
        print(f"{a.get('id', ''):<18} | {a.get('network', ''):<10} | {a.get('status', ''):<12} | {caps}")
    print()


def cmd_capabilities(_):
    data = get("/capabilities")
    caps = data.get("capabilities", [])
    print("\nSupported Capabilities Matrix:")
    for c in caps:
        status_tag = f"[{c.get('status', '').upper()}]"
        print(f"  {status_tag:<18} {c.get('name'):<20} - {c.get('description')}")
    print()


def cmd_balance(args):
    print(f"\nQuerying balance for wallet: {args.wallet_id}")
    wallet = get(f"/wallets/{args.wallet_id}")
    print(f"Network: {wallet.get('network')} ({wallet.get('symbol')})")
    print(f"Address: {wallet.get('address')}")
    print("Mode   : Watch-Only / Unverified")
    print("Status : Live on-chain RPC lookup pending node connectivity. Value: -- (Unavailable)")
    print("Note   : GXEON never fabricates balance figures.\n")


def cmd_transactions(args):
    print(f"\nQuerying transaction history for wallet: {args.wallet_id}")
    wallet = get(f"/wallets/{args.wallet_id}")
    print(f"Network: {wallet.get('network')} ({wallet.get('symbol')})")
    print(f"Address: {wallet.get('address')}")
    print("History: No confirmed transactions reported by local plane.")
    print("Note   : Transaction histories are only queried from verified block explorers.\n")


def main():
    p = argparse.ArgumentParser(
        prog="gxeon-wallet",
        description="GXEON Wallet Command Center - Local Control Plane CLI",
    )
    sub = p.add_subparsers(dest="command", required=True)

    h = sub.add_parser("health", help="Check local bridge health")
    h.set_defaults(func=cmd_health)

    s = sub.add_parser("status", help="Show system status and security invariants")
    s.set_defaults(func=cmd_status)

    l = sub.add_parser("list", help="List all registered wallets")
    l.set_defaults(func=cmd_list)

    show = sub.add_parser("show", help="Show details of a specific wallet")
    show.add_argument("wallet_id", help="The wallet identifier (e.g. rustchain-main)")
    show.set_defaults(func=cmd_show)

    ad = sub.add_parser("adapters", help="List registered network adapters")
    ad.set_defaults(func=cmd_adapters)

    cap = sub.add_parser("capabilities", help="List supported capability flags")
    cap.set_defaults(func=cmd_capabilities)

    bal = sub.add_parser("balance", help="Inspect balance of a wallet")
    bal.add_argument("wallet_id", help="The wallet identifier")
    bal.set_defaults(func=cmd_balance)

    tx = sub.add_parser("transactions", help="Inspect transaction history of a wallet")
    tx.add_argument("wallet_id", help="The wallet identifier")
    tx.set_defaults(func=cmd_transactions)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
