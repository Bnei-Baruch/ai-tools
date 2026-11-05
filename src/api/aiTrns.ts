import { AI_TRNS_API } from '../consts';
import { getToken, kc } from './UserManager';

// The user's Keycloak token. Nobody logged in: off to the login page.
async function token(): Promise<string> {
  const t = await getToken().catch(() => null);
  if (!t) {
    void kc.login({ redirectUri: window.location.href });
    throw new Error('יש להתחבר');
  }
  return t;
}

// A request to ai-trns with the user's Keycloak token.
export async function aiTrnsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const t = await token();
  const url = new URL(`${AI_TRNS_API}${path}`, window.location.href);
  try {
    return await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } });
  } catch {
    throw new Error('השרת אינו זמין');
  }
}

// GET /jobs/{id} of ai-trns (the fields used here)
export interface Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  stage?: string | null;
  progress?: number | null;
  queue_position?: number | null;
  error?: string | null;
  stats?: Record<string, number> | null;
  // epoch seconds
  created?: number | null;
  started?: number | null;
  finished?: number | null;
}

// Cloudflare in front of ai-tools.kab.info rejects request bodies above 100 MB.
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

function detail(status: number, statusText: string, text: string): Error {
  if (status === 413) return new Error('הקובץ גדול מדי: עד 100 MB');
  let message = text;
  try {
    const parsed = JSON.parse(text).detail;
    message = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  } catch {
    // not JSON, keep raw text
  }
  return new Error(`${status}${message ? `: ${message}` : ` ${statusText}`}`);
}

// POST a form that may carry files, with upload progress (0..100): only XHR reports it. -> the created job
export async function postJob(path: string, body: FormData, onUploadProgress?: (percent: number) => void): Promise<Job> {
  const t = await token();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', new URL(`${AI_TRNS_API}${path}`, window.location.href));
    xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    if (onUploadProgress) {
      xhr.upload.onprogress = (e) => e.lengthComputable && onUploadProgress(Math.round((e.loaded / e.total) * 100));
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as Job);
      else reject(detail(xhr.status, xhr.statusText, xhr.responseText));
    };
    xhr.onerror = () => reject(new Error('השרת אינו זמין'));
    xhr.send(body);
  });
}

const POLL_INTERVAL_MS = 2000;

// Polls the job until it is no longer queued or running; onUpdate gets every state. Throws unless done.
export async function waitJob(job: Job, onUpdate?: (job: Job) => void): Promise<Job> {
  onUpdate?.(job);
  while (job.status === 'queued' || job.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await aiTrnsFetch(`/jobs/${job.id}`);
    if (!res.ok) throw detail(res.status, res.statusText, await res.text().catch(() => ''));
    job = (await res.json()) as Job;
    onUpdate?.(job);
  }
  if (job.status !== 'done') throw new Error(job.error || 'העבודה נכשלה');
  return job;
}

// An existing job by id (e.g. from the page's address), waited for as waitJob does
export async function resumeJob(jobId: string, onUpdate?: (job: Job) => void): Promise<Job> {
  const res = await aiTrnsFetch(`/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw detail(res.status, res.statusText, await res.text().catch(() => ''));
  return waitJob((await res.json()) as Job, onUpdate);
}

// GET /jobs/{id}/result?format=...: the response, or an error
export async function jobResult(jobId: string, format?: string): Promise<Response> {
  const res = await aiTrnsFetch(`/jobs/${jobId}/result${format ? `?format=${encodeURIComponent(format)}` : ''}`);
  if (!res.ok) throw detail(res.status, res.statusText, await res.text().catch(() => ''));
  return res;
}

// "attachment; filename*=UTF-8''..." -> the name, or the fallback
export function responseFileName(res: Response, fallback: string): string {
  const header = res.headers.get('Content-Disposition') || '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

// A FormData from fields; arrays become repeated fields, empty values are left out
export function formOf(fields: Record<string, unknown>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const v of ([] as unknown[]).concat(value ?? [])) {
      if (v === '' || v == null) continue;
      body.append(name, v instanceof Blob ? v : String(v));
    }
  }
  return body;
}
