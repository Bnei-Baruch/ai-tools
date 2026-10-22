// Live text into a Google Doc from the browser, as the user (Google Identity Services token + Docs API).
// Only while this page is open; the server can write it too, as its service account (ai-trns /live/{id}/doc).

const SCOPE = 'https://www.googleapis.com/auth/documents';
const DOCS = 'https://docs.googleapis.com/v1/documents';
const FLUSH_MS = 3000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  callback: (r: TokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export function docId(url: string): string | null {
  return url.match(/\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/)?.[1] ?? null;
}

export const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

let gis: Promise<void> | null = null;

export function loadGis(): Promise<void> {
  gis ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gis = null;
      reject(new Error('Google אינו זמין'));
    };
    document.head.appendChild(script);
  });
  return gis;
}

// The user's Docs token: a Google consent popup the first time, silent after that while it is valid.
class GoogleAuth {
  private clientId: string;
  private client: TokenClient | null = null;
  private token = '';
  private expires = 0;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.expires - 60_000) return this.token;
    await loadGis();
    return new Promise((resolve, reject) => {
      const done = (r: TokenResponse) => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || 'Google: אין הרשאה'));
        this.token = r.access_token;
        this.expires = Date.now() + (r.expires_in ?? 3600) * 1000;
        resolve(this.token);
      };
      this.client ??= window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: done,
        error_callback: (e) => reject(new Error(e.message || e.type)),
      });
      this.client.callback = done;
      this.client.requestAccessToken({ prompt: this.token ? '' : undefined });
    });
  }
}

let auth: GoogleAuth | null = null;

async function api(clientId: string, method: string, path: string, body?: unknown): Promise<any> {
  auth ??= new GoogleAuth(clientId);
  for (let attempt = 0; ; attempt++) {
    const token = await auth.accessToken(attempt > 0);
    const res = await fetch(`${DOCS}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) continue;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google ${res.status}: ${data?.error?.message ?? res.statusText}`);
    return data;
  }
}

// Appends final words to the doc every FLUSH_MS until stop(). onError: a write failed (it is retried).
export class BrowserDocWriter {
  readonly id: string;
  readonly title: string;
  private clientId: string;
  private onError: (message: string) => void;
  private pending: string[] = [];
  private timer: number;
  private started: boolean;
  private busy = false;

  private constructor(clientId: string, id: string, title: string, empty: boolean,
    onError: (message: string) => void) {
    this.clientId = clientId;
    this.id = id;
    this.title = title;
    this.onError = onError;
    this.started = !empty;
    this.timer = window.setInterval(() => void this.flush(), FLUSH_MS);
  }

  // Opens the doc (asking the user for Google access if needed) and makes it right-to-left.
  static async open(clientId: string, id: string, onError: (message: string) => void): Promise<BrowserDocWriter> {
    const doc = await api(clientId, 'GET', id);
    const end: number = doc.body.content[doc.body.content.length - 1].endIndex;
    if (end > 1) {
      await api(clientId, 'POST', `${id}:batchUpdate`, {
        requests: [{
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: end },
            paragraphStyle: { direction: 'RIGHT_TO_LEFT' },
            fields: 'direction',
          },
        }],
      });
    }
    return new BrowserDocWriter(clientId, id, doc.title ?? '', end <= 2, onError);
  }

  push(words: string[]) {
    this.pending.push(...words);
  }

  async flush() {
    if (this.busy || !this.pending.length) return;
    this.busy = true;
    const words = this.pending;
    this.pending = [];
    try {
      await api(this.clientId, 'POST', `${this.id}:batchUpdate`, {
        requests: [{ insertText: { text: (this.started ? ' ' : '') + words.join(' '), endOfSegmentLocation: {} } }],
      });
      this.started = true;
    } catch (err) {
      this.pending = [...words, ...this.pending];
      this.onError(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
    }
  }

  // Writes what is left, then stops.
  async stop() {
    window.clearInterval(this.timer);
    await this.flush();
  }
}
