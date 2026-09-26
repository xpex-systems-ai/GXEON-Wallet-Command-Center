/**
 * Firebase Control Plane Foundation
 * Handles environment-based configuration, App Check, and Firestore connectivity metadata.
 * ABSOLUTE SECURITY INVARIANT: NEVER receives or stores private keys.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  appCheckSiteKey?: string;
}

export class FirebaseService {
  private config: FirebaseConfig | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init(): void {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

    if (apiKey && projectId) {
      this.config = {
        apiKey,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
        appCheckSiteKey: import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY,
      };
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
    }
  }

  getStatus(): {
    configured: boolean;
    projectId?: string;
    authDomain?: string;
    appCheckActive: boolean;
  } {
    return {
      configured: this.isConfigured,
      projectId: this.config?.projectId || 'Not Configured (Local Mode)',
      authDomain: this.config?.authDomain || 'Not Configured',
      appCheckActive: Boolean(this.config?.appCheckSiteKey),
    };
  }
}

export const firebaseService = new FirebaseService();
