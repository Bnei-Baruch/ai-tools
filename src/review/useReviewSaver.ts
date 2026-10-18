import { useCallback, useEffect, useRef, useState } from 'react';
import { putResult, type ReviewResult } from '../api/review';

const DEBOUNCE_MS = 1000;
const RETRY_MS = 5000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// Every change is first written here (synchronously), and removed once the server has it:
// a closed tab or a network error loses nothing, the next visit re-sends the draft.
type Key = Pick<ReviewResult, 'set_id' | 'reviewer' | 'segment_id'>;
const draftKey = ({ set_id, reviewer, segment_id }: Key) => `review-draft:${set_id}:${reviewer}:${segment_id}`;

export function readDraft(key: Key): ReviewResult | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(key)) ?? 'null');
  } catch {
    return null;
  }
}

function writeDraft(r: ReviewResult) {
  try {
    localStorage.setItem(draftKey(r), JSON.stringify(r));
  } catch {
    // storage full or blocked: the server save still runs
  }
}

function clearDraft(r: ReviewResult) {
  try {
    if (readDraft(r)?.updated_at === r.updated_at) localStorage.removeItem(draftKey(r));
  } catch {
    // ignore
  }
}

// Saves one segment's result: debounced, in order, retried until it gets through.
export default function useReviewSaver() {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<ReviewResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const chain = useRef(Promise.resolve());

  const flush = useCallback(({ keepalive = false } = {}) => {
    clearTimeout(timer.current);
    const r = pending.current;
    if (!r) return chain.current;
    pending.current = null;
    chain.current = chain.current.then(async () => {
      try {
        await putResult(r, { keepalive });
        clearDraft(r);
        if (!pending.current) setState('saved');
      } catch {
        pending.current ??= r;
        setState('error');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), RETRY_MS);
      }
    });
    return chain.current;
  }, []);

  // now: skip the debounce (finishing a segment, leaving the page)
  const save = useCallback((r: ReviewResult, { now = false, keepalive = false } = {}) => {
    writeDraft(r);
    pending.current = r;
    setState((s) => (s === 'error' ? s : 'saving'));
    clearTimeout(timer.current);
    if (now) return flush({ keepalive });
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return chain.current;
  }, [flush]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { state, save };
}

// A draft the server doesn't have (the tab was closed mid-save, the network was down): send it again.
export async function resendDraft(r: ReviewResult): Promise<void> {
  await putResult(r);
  clearDraft(r);
}
