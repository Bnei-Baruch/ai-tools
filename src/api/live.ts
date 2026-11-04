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
// docs: the Google Docs the text goes into (the server's, and the ones listeners' pages write)
export interface LiveEvent {
  type: 'start' | 'final' | 'partial' | 'reset' | 'end' | 'error' | 'docs';
  words: LiveWord[];
  message?: string;
  duration_s?: number;
  end_s?: number;
  decode_s?: number;
  server?: ServerDoc | null;
  browser?: ListenerDoc[];
}

// the doc the server creates with the job, on its own account (when ai-trns has one configured)
export interface ServerDoc {
  url?: string;
  title?: string;
  error?: string;
}

// a doc a listener's page writes as its user
export interface ListenerDoc {
  url: string;
  title: string;
  by: string;
}

// This page writes the text into a doc of its user's; repeat it while writing (the API forgets a doc
// whose page has not said so for a minute).
export async function addListenerDoc(jobId: string, url: string, title: string): Promise<void> {
  const form = new FormData();
  form.set('url', url);
  form.set('title', title);
  const res = await aiTrnsFetch(`/live/${jobId}/doc`, { method: 'PUT', body: form });
  if (!res.ok) throw await errorFrom(res);
}

export async function dropListenerDoc(jobId: string, url: string): Promise<void> {
  await aiTrnsFetch(`/live/${jobId}/doc?url=${encodeURIComponent(url)}`, { method: 'DELETE' }).catch(() => {});
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
