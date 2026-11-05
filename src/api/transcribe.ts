import { aiTrnsFetch, waitJob, type Job } from './aiTrns';
import { parseSrt } from './srt.ts';
import { clipFields, type Clip } from '../stt/input.ts';

// SRT helpers live in srt.ts (no browser imports, so node tests can use them)
export { chunksToSrt, parseSrt } from './srt.ts';

export interface Chunk {
  start: number;
  end: number;
  text: string;
  // a paragraph of the speakers view (api/speakers.ts): its speaker label, the start and end of each word of text
  speaker?: string | null;
  times?: number[];
  ends?: number[];
}

export interface SttResult {
  text: string;
  chunks: Chunk[];
  srt?: string;
  jobId: string;
}

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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

// An ai-trns job for a media URL (Hebrew): POST /jobs -> poll GET /jobs/{id} -> the SRT.
export async function transcribe(url: string): Promise<SttResult> {
  const job = await startTranscribe(url);
  await waitJob(job);
  return transcriptOf(job.id);
}

// POST /jobs for a media URL (Hebrew, SRT) -> the queued job; wait for it with waitJob / resumeJob (aiTrns.ts).
// clip: only that part of the media (the result's times are the media's)
export async function startTranscribe(url: string, clip?: Clip | null): Promise<Job> {
  const form = new FormData();
  form.set('url', url);
  form.set('lang', 'he');
  form.set('format', 'srt');
  for (const [k, v] of Object.entries(clipFields(clip))) form.set(k, v);
  return json<Job>(await aiTrnsFetch('/jobs', { method: 'POST', body: form }));
}

// A finished transcribe job's SRT, as chunks
export async function transcriptOf(jobId: string): Promise<SttResult> {
  const res = await aiTrnsFetch(`/jobs/${jobId}/result?format=srt`);
  if (!res.ok) throw await errorFrom(res);
  const srt = await res.text();
  const chunks = parseSrt(srt);
  return { text: chunks.map((c) => c.text).join(' '), chunks, srt, jobId };
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
