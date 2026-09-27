export interface FirestoreDocument<T> {
  data: T;
  updateTime?: string;
}

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

let cachedGoogleAccessToken: { token: string; expiresAt: number } | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for durable Firestore access`);
  }
  return value;
}

export function isFirestoreRestConfigured(): boolean {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID) &&
      process.env.GCP_WIF_AUDIENCE &&
      process.env.VERCEL_OIDC_TOKEN
  );
}

function projectId(): string {
  return (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || '').trim();
}

function documentName(collection: string, id: string): string {
  return `projects/${projectId()}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested !== undefined) fields[key] = encodeValue(nested);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) fields[key] = encodeValue(value);
  }
  return fields;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) data[key] = decodeValue(value);
  return data;
}

async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAt - 60_000 > now) {
    return cachedGoogleAccessToken.token;
  }

  const subjectToken = required('VERCEL_OIDC_TOKEN');
  const audience = required('GCP_WIF_AUDIENCE');

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    audience,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: subjectToken,
  });

  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!sts.ok) {
    throw new Error(`GCP STS exchange failed with HTTP ${sts.status}`);
  }

  const stsJson = (await sts.json()) as {
    access_token: string;
    expires_in?: number;
  };

  let accessToken = stsJson.access_token;
  let expiresIn = stsJson.expires_in || 3600;

  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (serviceAccountEmail) {
    const impersonation = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          scope: ['https://www.googleapis.com/auth/datastore'],
          lifetime: '3600s',
        }),
      }
    );

    if (!impersonation.ok) {
      throw new Error(`GCP service-account impersonation failed with HTTP ${impersonation.status}`);
    }

    const json = (await impersonation.json()) as {
      accessToken: string;
      expireTime?: string;
    };
    accessToken = json.accessToken;
    if (json.expireTime) {
      expiresIn = Math.max(60, Math.floor((Date.parse(json.expireTime) - Date.now()) / 1000));
    }
  }

  cachedGoogleAccessToken = {
    token: accessToken,
    expiresAt: now + expiresIn * 1000,
  };
  return accessToken;
}

async function firestoreFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!projectId()) throw new Error('FIREBASE_PROJECT_ID or GCP_PROJECT_ID is required');
  const token = await getGoogleAccessToken();
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    }
  );
}

function asDocument<T>(doc: FirestoreRestDocument): FirestoreDocument<T> {
  return {
    data: decodeFields(doc.fields || {}) as T,
    updateTime: doc.updateTime,
  };
}

export class FirestoreRestClient {
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firestoreFetch('?pageSize=1');
      return response.ok;
    } catch {
      return false;
    }
  }

  async get<T>(collection: string, id: string): Promise<FirestoreDocument<T> | null> {
    const response = await firestoreFetch(
      `/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore GET failed with HTTP ${response.status}`);
    return asDocument<T>((await response.json()) as FirestoreRestDocument);
  }

  async createIfAbsent<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    data: T
  ): Promise<{ created: boolean; document: FirestoreDocument<T> }> {
    const response = await firestoreFetch(
      `/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        body: JSON.stringify({ fields: encodeFields(data) }),
      }
    );

    if (response.status === 409) {
      const existing = await this.get<T>(collection, id);
      if (!existing) throw new Error('Firestore conflict detected but existing document was not readable');
      return { created: false, document: existing };
    }

    if (!response.ok) {
      throw new Error(`Firestore CREATE failed with HTTP ${response.status}`);
    }

    return {
      created: true,
      document: asDocument<T>((await response.json()) as FirestoreRestDocument),
    };
  }

  async set<T extends Record<string, unknown>>(collection: string, id: string, data: T): Promise<void> {
    const updateMask = Object.keys(data)
      .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
      .join('&');
    const suffix = updateMask ? `?${updateMask}` : '';
    const response = await firestoreFetch(
      `/${encodeURIComponent(collection)}/${encodeURIComponent(id)}${suffix}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ fields: encodeFields(data) }),
      }
    );
    if (!response.ok) throw new Error(`Firestore PATCH failed with HTTP ${response.status}`);
  }

  async atomicCommit(writes: Array<Record<string, unknown>>): Promise<'COMMITTED' | 'ALREADY_EXISTS'> {
    const response = await firestoreFetch(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes }),
    });

    if (response.status === 409) return 'ALREADY_EXISTS';
    if (!response.ok) throw new Error(`Firestore COMMIT failed with HTTP ${response.status}`);
    return 'COMMITTED';
  }

  makeUpdateWrite(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: { exists?: boolean }
  ): Record<string, unknown> {
    const write: Record<string, unknown> = {
      update: {
        name: documentName(collection, id),
        fields: encodeFields(data),
      },
    };
    if (typeof options?.exists === 'boolean') {
      write.currentDocument = { exists: options.exists };
    }
    return write;
  }
}
