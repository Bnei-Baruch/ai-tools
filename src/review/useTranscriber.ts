import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribe } from '../api/transcribe';
import { ConflictError, uploadTranscript, type ReviewSegment } from '../api/review';

const UPLOAD_ATTEMPTS = 3;
const RETRY_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Lessons are transcribed here, in the browser (the stt-api server can't reach the STT service), and the
// transcript is uploaded to the set. Minutes of work: the tab warns before closing while one is running.
// onUpdated: the segment as the server has it now; onConflict: someone else uploaded first, re-read the set.
export default function useTranscriber(
  setId: string,
  reviewer: string,
  onUpdated: (segment: ReviewSegment) => void,
  onConflict: () => void,
) {
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const runningRef = useRef(new Set<string>());
  const callbacks = useRef({ onUpdated, onConflict });
  callbacks.current = { onUpdated, onConflict };

  const update = (id: string, on: boolean) => {
    if (on) runningRef.current.add(id);
    else runningRef.current.delete(id);
    setRunning(new Set(runningRef.current));
  };

  const run = useCallback(async (segment: ReviewSegment, model: string) => {
    if (runningRef.current.has(segment.id)) return;
    update(segment.id, true);
    try {
      let body;
      try {
        const { chunks } = await transcribe(segment.media_url);
        body = { reviewer, model, chunks };
      } catch (e) {
        body = { reviewer, model, error: message(e) };
      }
      for (let attempt = 1; ; attempt++) {
        try {
          callbacks.current.onUpdated(await uploadTranscript(setId, segment.id, body));
          return;
        } catch (e) {
          if (e instanceof ConflictError) {
            callbacks.current.onConflict();
            return;
          }
          if (attempt >= UPLOAD_ATTEMPTS) {
            window.alert(`התמלול של „${segment.title}“ לא נשמר: ${message(e)}. אפשר לנסות שוב מהרשימה.`);
            return;
          }
          await sleep(RETRY_MS);
        }
      }
    } finally {
      update(segment.id, false);
    }
  }, [setId, reviewer]);

  useEffect(() => {
    if (!running.size) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running.size]);

  return { running, run };
}
