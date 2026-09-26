/**
 * GXEON Wallet Command Center — Production Firebase Auth Live Smoke Test
 * MISSION: GXEON-AUTH-LIVE-SMOKE-001
 * Target: studio-1105349706-f3598 / https://studio-1105349706-f3598.web.app
 */

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore'

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCxQPSyDtajgsep33mkcbd5StczQd24HeY',
  authDomain: 'studio-1105349706-f3598.firebaseapp.com',
  projectId: 'studio-1105349706-f3598',
  storageBucket: 'studio-1105349706-f3598.firebasestorage.app',
  messagingSenderId: '57164034605',
  appId: '1:57164034605:web:8d7b920d1a111bd1533ea4',
}

const results = {
  firebaseAuth: 'FAILED',
  emailPasswordProvider: 'DISABLED',
  registration: 'FAIL',
  login: 'FAIL',
  sessionPersistence: 'FAIL',
  userProfile: 'FAIL',
  firestoreOwnerAccess: 'FAIL',
  unauthenticatedBlocked: 'FAIL',
  crossUserBlocked: 'FAIL',
  sensitiveFieldsBlocked: 'FAIL',
  invalidPasswordBlocked: 'FAIL',
  unknownAccountBlocked: 'FAIL',
  logout: 'FAIL',
}

async function runSmokeTest() {
  console.log('=== GXEON LIVE AUTH & FIRESTORE SMOKE TEST ===')
  console.log(`Target Project: ${FIREBASE_CONFIG.projectId}`)

  const app = initializeApp(FIREBASE_CONFIG, `smoke-${Date.now()}`)
  const auth = getAuth(app)
  const db = getFirestore(app)

  const testEmail = `gxeon.smoke.${Date.now()}@internal.gxeon.io`
  const testPassword = `GxP@ss#${Math.random().toString(36).substring(2, 10)}!99`
  let testUid = null
  let userCredential = null

  // 1. REGISTRATION TEST
  console.log('\n[1] Testing Registration...')
  try {
    userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword)
    testUid = userCredential.user.uid
    console.log(`✓ Registration succeeded. UID: ${testUid}`)
    results.firebaseAuth = 'ACTIVE'
    results.emailPasswordProvider = 'ENABLED'
    results.registration = 'PASS'
  } catch (err) {
    console.error(`✗ Registration failed:`, err.code, err.message)
    if (err.code === 'auth/configuration-not-found') {
      console.error('CRITICAL: Identity Platform / Auth is not configured on project')
    }
    return results
  }

  // 2. FIRESTORE OWNER PROFILE WRITE & READ (/users/{uid})
  console.log('\n[2] Testing /users/{uid} Owner Read/Write...')
  try {
    const userDocRef = doc(db, 'users', testUid)
    const profileData = {
      uid: testUid,
      email: testEmail,
      displayName: 'GXEON Smoke Auditor',
      role: 'operator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await setDoc(userDocRef, profileData)
    console.log('✓ Wrote user profile to /users/{uid}')

    const snapshot = await getDoc(userDocRef)
    if (snapshot.exists() && snapshot.data().email === testEmail) {
      console.log('✓ Read user profile from /users/{uid} matching owner')
      results.userProfile = 'PASS'
      results.firestoreOwnerAccess = 'PASS'
    } else {
      console.error('✗ User profile read did not match expected data')
    }
  } catch (err) {
    console.error('✗ Firestore owner profile access failed:', err.code, err.message)
  }

  // 3. NEGATIVE TEST: SENSITIVE FIELDS BLOCK
  console.log('\n[3] Testing Sensitive Field Block (privateKey / seedPhrase in Firestore)...')
  try {
    const userDocRef = doc(db, 'users', testUid)
    await setDoc(userDocRef, { privateKey: '0x123456789abcdef' }, { merge: true })
    console.error('✗ Security failure: Private key write was allowed!')
  } catch (err) {
    console.log(`✓ Security success: Sensitive field write rejected (${err.code})`)
    results.sensitiveFieldsBlocked = 'PASS'
  }

  // 4. NEGATIVE TEST: CROSS-USER WRITE BLOCK
  console.log('\n[4] Testing Cross-User Isolation (User A writing User B profile)...')
  const victimUid = `victim-uid-${Date.now()}`
  try {
    const victimRef = doc(db, 'users', victimUid)
    await setDoc(victimRef, { uid: victimUid, email: 'victim@fake.io' })
    console.error('✗ Security failure: Cross-user write was allowed!')
  } catch (err) {
    console.log(`✓ Security success: Cross-user write rejected (${err.code})`)
    results.crossUserBlocked = 'PASS'
  }

  // 5. LOGOUT TEST
  console.log('\n[5] Testing Sign Out...')
  try {
    await signOut(auth)
    console.log('✓ Sign out succeeded')
    results.logout = 'PASS'
  } catch (err) {
    console.error('✗ Sign out failed:', err.message)
  }

  // 6. NEGATIVE TEST: UNAUTHENTICATED FIRESTORE ACCESS BLOCK
  console.log('\n[6] Testing Unauthenticated Access Block...')
  try {
    const userDocRef = doc(db, 'users', testUid)
    await setDoc(userDocRef, { displayName: 'Hacked While Logged Out' }, { merge: true })
    console.error('✗ Security failure: Unauthenticated write was allowed!')
  } catch (err) {
    console.log(`✓ Security success: Unauthenticated write rejected (${err.code})`)
    results.unauthenticatedBlocked = 'PASS'
  }

  // 7. NEGATIVE TEST: INVALID PASSWORD REJECTION
  console.log('\n[7] Testing Invalid Password Rejection...')
  try {
    await signInWithEmailAndPassword(auth, testEmail, 'WrongPassword!123')
    console.error('✗ Security failure: Invalid password login was allowed!')
  } catch (err) {
    console.log(`✓ Security success: Invalid password rejected (${err.code})`)
    results.invalidPasswordBlocked = 'PASS'
  }

  // 8. NEGATIVE TEST: UNKNOWN ACCOUNT REJECTION
  console.log('\n[8] Testing Unknown Account Rejection...')
  try {
    await signInWithEmailAndPassword(auth, `nonexistent.${Date.now()}@fake.io`, 'SomeP@ss123!')
    console.error('✗ Security failure: Unknown account login was allowed!')
  } catch (err) {
    console.log(`✓ Security success: Unknown account rejected (${err.code})`)
    results.unknownAccountBlocked = 'PASS'
  }

  // 9. RE-LOGIN TEST
  console.log('\n[9] Testing Valid Login & Session Persistence...')
  try {
    const reLoginCred = await signInWithEmailAndPassword(auth, testEmail, testPassword)
    if (reLoginCred.user.uid === testUid) {
      console.log('✓ Re-login succeeded with created credentials')
      results.login = 'PASS'

      // Session persistence validation (token retrieval & validity)
      const token = await reLoginCred.user.getIdToken(true)
      if (token && typeof token === 'string' && token.length > 50) {
        console.log('✓ Valid ID Token generated & refreshed for persistent session')
        results.sessionPersistence = 'PASS'
      }
    }
  } catch (err) {
    console.error('✗ Re-login failed:', err.message)
  }

  // Clean up test document
  try {
    const userDocRef = doc(db, 'users', testUid)
    await deleteDoc(userDocRef)
    console.log('\n✓ Cleaned up smoke test document')
  } catch {
    // Ignore cleanup error
  }

  await signOut(auth)

  console.log('\n=== SMOKE TEST SUMMARY ===')
  console.log(JSON.stringify(results, null, 2))
  return results
}

runSmokeTest()
