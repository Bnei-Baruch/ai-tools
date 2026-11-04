import { STT_URL } from '../consts';
import { aiTrnsFetch } from './aiTrns';

export interface Chunk {
  start: number;
  end: number;
  text: string;
}

export interface SttResult {
  text: string;
  chunks: Chunk[];
  srt?: string;
  jobId: string;
}

// GET /jobs/{id} of ai-trns (the fields used here)
interface Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  error?: string | null;
}

const POLL_INTERVAL_MS = 2000;

export async function errorFrom(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text).detail;
    detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  } catch {
    // not JSON, keep raw text
  }
  return new Error(`${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

// An ai-trns job for a media URL (Hebrew): POST /jobs -> poll GET /jobs/{id} -> the SRT.
export async function transcribe(url: string): Promise<SttResult> {
  const form = new FormData();
  form.set('url', url);
  form.set('lang', 'he');
  form.set('format', 'srt');
  let job = await json<Job>(await aiTrnsFetch('/jobs', { method: 'POST', body: form }));

  while (job.status === 'queued' || job.status === 'running') {
    await sleep(POLL_INTERVAL_MS);
    job = await json<Job>(await aiTrnsFetch(`/jobs/${job.id}`));
  }
  if (job.status !== 'done') throw new Error(job.error || 'התמלול נכשל');

  const res = await aiTrnsFetch(`/jobs/${job.id}/result?format=srt`);
  if (!res.ok) throw await errorFrom(res);
  const srt = await res.text();
  const chunks = parseSrt(srt);
  return { text: chunks.map((c) => c.text).join(' '), chunks, srt, jobId: job.id };
}

// stt-api's job (STT_URL): POST {urls} -> 202 + Location: /jobs/<id>, poll it until the file's SRT is there
// (inline, or at srt_url). No token.
interface SttApiFile {
  url: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  warnings?: string[];
  srt_url?: string;
  srt?: string;
  error?: string;
}

interface SttApiJob {
  status: 'queued' | 'running' | 'done' | 'failed';
  results: SttApiFile[];
}

export async function transcribeSttApi(url: string): Promise<SttResult> {
  const endpoint = new URL(STT_URL, window.location.href);
  const post = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url] }),
  });
  if (post.status !== 202) throw await errorFrom(post);
  const location = post.headers.get('Location');
  if (!location) throw new Error('תגובת השרת חסרה כותרת Location לעבודה');
  const jobUrl = new URL(location, endpoint);
  const jobId = jobUrl.pathname.split('/').filter(Boolean).pop() ?? '';

  for (;;) {
    const job = await json<SttApiJob>(await fetch(jobUrl));
    const file = job.results.find((f) => f.url === url) ?? job.results[0];
    if (file?.status === 'failed' || file?.status === 'skipped') {
      throw new Error(file.error ?? file.warnings?.join('; ') ?? 'התמלול נכשל');
    }
    if (job.status === 'failed') throw new Error('העבודה נכשלה');

    let srt = file?.srt;
    if (!srt && file?.srt_url) {
      const res = await fetch(new URL(file.srt_url, jobUrl));
      if (!res.ok) throw await errorFrom(res);
      srt = await res.text();
    }
    if (srt) {
      const chunks = parseSrt(srt);
      return { text: chunks.map((c) => c.text).join(' '), chunks, srt, jobId };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

// Parses "HH:MM:SS,mmm" SRT timestamps into seconds.
function srtTimeToSeconds(t: string): number {
  const [h, m, rest] = t.split(':');
  const [s, ms] = rest.split(',');
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseSrt(srt: string): Chunk[] {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const chunks: Chunk[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [start, end] = timeLine.split('-->').map((t) => srtTimeToSeconds(t.trim()));
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (text) chunks.push({ start, end, text });
  }
  return chunks;
}

// "HH:MM:SS.mmm" timestamp for WebVTT cues
function vttTime(s: number): string {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${h}:${m}:${sec}`;
}

export function chunksToVtt(chunks: Chunk[]): string {
  const cues = chunks
    .filter((c) => c.start != null && c.end != null)
    .map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}`);
  return 'WEBVTT\n\n' + cues.join('\n\n');
}

export function formatTimestamp(s: number | null | undefined): string {
  if (s == null) return '--:--';
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}
