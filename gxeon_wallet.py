from __future__ import annotations

import argparse
import json
import sys
from urllib.request import urlopen
from urllib.error import URLError

BASE_URL = "http://127.0.0.1:8790"


def get(path: str):
    try:
        with urlopen(BASE_URL + path, timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except URLError as e:
        print(f"Bridge offline: {e}")
        sys.exit(2)


def cmd_health(_):
    print(json.dumps(get("/health"), indent=2))


def cmd_list(_):
    data = get("/wallets")
    wallets = data.get("wallets", [])
    if not wallets:
        print("No wallets registered.")
        return
    for w in wallets:
        verified = "VERIFIED" if w.get("ownership_verified") else "UNVERIFIED"
        print(f"[{w.get('network')}] {w.get('name')}  {w.get('address')}  {w.get('mode')}  {verified}")


def main():
    p = argparse.ArgumentParser(prog="gxeon-wallet", description="GXEON Wallet Command Center CLI")
    sub = p.add_subparsers(required=True)
    h = sub.add_parser("health")
    h.set_defaults(func=cmd_health)
    l = sub.add_parser("list")
    l.set_defaults(func=cmd_list)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
