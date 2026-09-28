# Firebase Deployment Guide — GXEON Wallet Command Center V1

## 1. Safety & Isolation Warning

> [!CAUTION]
> **DO NOT DEPLOY TO XPEX ACADEMY OR EXISTING PRODUCTION FIREBASE PROJECTS.**
> The GXEON Wallet Command Center must be configured in a dedicated, isolated Firebase project: `gxeon-wallet-command-center`.

---

## 2. Architecture & Security Invariants

1. **Zero Private Keys in Cloud:**
   - The Cloud Control Plane (Firebase Hosting / Firestore) only handles public wallet addresses, unverified/verified status tags, audit trails, and bounty metadata.
   - Private keys and signing operations are strictly confined to the local signing bridge (`127.0.0.1:8790`).

2. **Firestore Security Rules:**
   - All client reads and writes require authentication (`request.auth != null`).
   - Every document is owner-isolated (`request.auth.uid == resource.data.ownerUid`).
   - Any document containing private keys, mnemonics, seeds, or secret tokens is immediately blocked at the rules engine level.

---

## 3. Deployment Steps

1. **Verify Project Configuration:**
   - Default project configured in `.firebaserc`: `gxeon-wallet-command-center`.

2. **Deploy Security Rules & Firestore Indexes:**
   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes --project gxeon-wallet-command-center
   ```

3. **Build & Deploy Production Frontend Hosting:**
   ```powershell
   npm run build
   firebase deploy --only hosting --project gxeon-wallet-command-center
   ```

4. **Environment Configuration for Operators:**
   - Copy `.env.example` to `.env` and configure `VITE_FIREBASE_*` variables for production hosting.
   - Never commit `.env` or real API credentials to source control.
