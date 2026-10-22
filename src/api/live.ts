import { aiTrnsFetch } from './aiTrns';
import { errorFrom } from './transcribe';

// ai-trns live jobs (ai_trns/api/live.py): POST /live -> events while the worker hears the stream ->
// the usual GET /jobs/{id}/result at the end.

export interface LiveWord {
  word: string;
  start_s: number;
  end_s: number;
  probability: number;
}

// start: audio is coming (start the player now); final: words that will not change; partial: the
// current guess after them; reset: the worker restarted the stream, drop everything; end / error: over;
// doc: the job's Google Doc was set (url null: dropped) or writing it failed (error)
export interface LiveEvent {
  type: 'start' | 'final' | 'partial' | 'reset' | 'end' | 'error' | 'doc';
  words: LiveWord[];
  message?: string;
  duration_s?: number;
  end_s?: number;
  decode_s?: number;
  url?: string | null;
  title?: string;
  mode?: DocMode;
  by?: string;
  error?: string;
}

// who writes the doc: the server as its service account, or a listener's page as its user
export type DocMode = 'server' | 'browser';

export interface LiveConfig {
  // set: the server can write Google Docs shared with this account
  google_service_account: string | null;
}

export async function liveConfig(): Promise<LiveConfig> {
  const res = await aiTrnsFetch('/live/config');
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

// Sets the job's doc; mode "server": the server checks it is shared with its account and writes it.
export async function setLiveDoc(jobId: string, url: string, mode: DocMode): Promise<void> {
  const form = new FormData();
  form.set('url', url);
  form.set('mode', mode);
  const res = await aiTrnsFetch(`/live/${jobId}/doc`, { method: 'PUT', body: form });
  if (!res.ok) throw await errorFrom(res);
}

export async function dropLiveDoc(jobId: string): Promise<void> {
  const res = await aiTrnsFetch(`/live/${jobId}/doc`, { method: 'DELETE' });
  if (!res.ok) throw await errorFrom(res);
}

interface Job {
  id: string;
  status: string;
}

export async function startLive(url: string): Promise<string> {
  const form = new FormData();
  form.set('url', url);
  form.set('lang', 'he');
  const res = await aiTrnsFetch('/live', { method: 'POST', body: form });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as Job).id;
}

// Leave the stream. The last one listening finishes it (stopping: true, the result follows as "end");
// otherwise it goes on for the others (a broadcast is one job for everyone) and the caller just leaves.
// Nobody listening finishes it on the server too, so closing the page needs no call.
export async function stopLive(jobId: string): Promise<{ stopping: boolean; listeners: number }> {
  const res = await aiTrnsFetch(`/live/${jobId}/stop`, { method: 'POST' });
  if (res.status === 409) return { stopping: true, listeners: 0 };
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

// Server-sent events through fetch, so the request carries the token (EventSource can't).
// Resolves when the stream ends (after end / error) or `signal` aborts it.
export async function listenLive(jobId: string, onEvent: (e: LiveEvent) => void, signal: AbortSignal) {
  const res = await aiTrnsFetch(`/live/${jobId}/events`, { signal });
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (data) onEvent(JSON.parse(data) as LiveEvent);
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    throw err;
  }
}

export async function liveResult(jobId: string, format: 'srt' | 'txt'): Promise<string> {
  const res = await aiTrnsFetch(`/jobs/${jobId}/result?format=${format}`);
  if (!res.ok) throw await errorFrom(res);
  return res.text();
}
