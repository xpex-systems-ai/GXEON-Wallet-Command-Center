# Firebase Deployment Guide — GXEON Wallet Command Center

## 1. Safety & Isolation Warning

> [!CAUTION]
> **DO NOT DEPLOY TO XPEX ACADEMY OR EXISTING PRODUCTION FIREBASE PROJECTS.**
> The GXEON Wallet Command Center must be configured in a dedicated, isolated Firebase project (e.g. `gxeon-wallet-command-center`).

---

## 2. Configuration Steps

1. **Create Isolated Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/).
   - Create project `gxeon-wallet-v1`.
   - Enable **Cloud Firestore** in production mode.
   - Enable **Firebase Hosting**.

2. **Setup Local Environment Variables:**
   - Copy `.env.example` to `.env`:
     ```powershell
     cp .env.example .env
     ```
   - Fill in your project client identifiers (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, etc.).
   - Ensure no private keys or secrets are written to `.env`.

3. **Deploy Security Rules & Indexes:**
   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes
   ```

4. **Build & Deploy Hosting:**
   ```powershell
   npm run build
   firebase deploy --only hosting
   ```
