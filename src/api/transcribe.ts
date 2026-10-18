import { STT_URL } from '../consts';

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

interface JobResult {
  url: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  warnings?: string[];
  srt_url?: string;
  srt?: string;
  error?: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'failed';
  results: JobResult[];
}

const POLL_INTERVAL_MS = 2000;

async function errorFrom(res: Response): Promise<Error> {
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

async function fetchText(url: string | URL): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw await errorFrom(res);
  return res.text();
}

// Async job API: POST returns 202 + Location: /jobs/<id>, poll GET until the
// requested file's SRT is available (srt inline, or fetched via srt_url).
export async function transcribe(url: string): Promise<SttResult> {
  const endpoint = new URL(STT_URL, window.location.href);

  const postRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url] }),
  });
  if (postRes.status !== 202) throw await errorFrom(postRes);

  const location = postRes.headers.get('Location');
  if (!location) throw new Error('תגובת השרת חסרה כותרת Location לעבודה');
  const jobUrl = new URL(location, endpoint);
  const jobId = jobUrl.pathname.split('/').filter(Boolean).pop() ?? '';

  for (;;) {
    const jobRes = await fetch(jobUrl);
    if (!jobRes.ok) throw await errorFrom(jobRes);
    const job = (await jobRes.json()) as JobStatus;
    const file = job.results.find((f) => f.url === url) ?? job.results[0];

    if (file?.status === 'failed' || file?.status === 'skipped') {
      throw new Error(file.error ?? file.warnings?.join('; ') ?? 'התמלול נכשל');
    }
    if (job.status === 'failed') throw new Error('העבודה נכשלה');

    const srt = file?.srt ?? (file?.srt_url ? await fetchText(new URL(file.srt_url, jobUrl)) : null);
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
