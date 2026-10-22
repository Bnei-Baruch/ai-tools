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
// current guess after them; reset: the worker restarted the stream, drop everything; end / error: over
export interface LiveEvent {
  type: 'start' | 'final' | 'partial' | 'reset' | 'end' | 'error';
  words: LiveWord[];
  message?: string;
  duration_s?: number;
  end_s?: number;
  decode_s?: number;
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

export async function stopLive(jobId: string): Promise<void> {
  const res = await aiTrnsFetch(`/live/${jobId}/stop`, { method: 'POST' });
  if (!res.ok && res.status !== 409) throw await errorFrom(res);
}

export async function cancelLive(jobId: string): Promise<void> {
  await aiTrnsFetch(`/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {});
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
