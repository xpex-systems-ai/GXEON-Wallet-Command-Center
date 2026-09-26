# Security Policy

This repository must never contain:

- private wallet keys
- seed phrases / mnemonics
- wallet passwords
- recovery codes
- signing files
- exchange API secrets
- environment files containing secrets

Only public addresses and non-sensitive metadata belong in source control.

The local bridge is intentionally bound to `127.0.0.1`.

Any future transaction workflow must require an explicit human confirmation before wallet signing or broadcast.
