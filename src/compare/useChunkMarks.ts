import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ChunkReview, ReviewResult, ReviewStatus } from '../api/review';
import useActiveSeconds from '../review/useActiveSeconds';
import useReviewSaver from '../review/useReviewSaver';
import type { ReviewLesson } from './reviewLesson';

// position and working time are saved this often, marks right away (as on the review page)
const PROGRESS_SAVE_MS = 15_000;

// Marks on the model's chunks, saved as the reviewer's result for the lesson -- the same result
// SegmentReview edits: corrected text + error category (+ comment) per changed chunk.
// lesson null: marking is off (the model's transcript isn't the set's), nothing is saved.
export default function useChunkMarks(lesson: ReviewLesson | null, videoRef: RefObject<HTMLVideoElement | null>, playing: boolean) {
  const chunks = lesson?.segment.chunks ?? [];
  const initial = lesson?.initial ?? null;

  const [edits, setEditsState] = useState<Record<number, ChunkReview>>(
    () => Object.fromEntries((initial?.chunks ?? []).map((c) => [c.index, c])),
  );
  const [status, setStatusState] = useState<ReviewStatus>(initial?.status ?? 'in_progress');
  // also in refs, updated at once: changes within one event must see each other, and so must the save
  const editsRef = useRef(edits);
  const statusRef = useRef(status);
  const setEdits = (next: Record<number, ChunkReview>) => {
    editsRef.current = next;
    setEditsState(next);
  };
  const setStatus = (next: ReviewStatus) => {
    statusRef.current = next;
    setStatusState(next);
  };

  const activeSeconds = useActiveSeconds(initial?.active_seconds ?? 0, playing);
  const saver = useReviewSaver();

  const isChanged = (e: ChunkReview) => !!chunks[e.index] && e.corrected !== chunks[e.index].text;
  const incomplete = Object.values(edits).filter((e) => isChanged(e) && !e.category);
  const changedCount = Object.values(edits).filter(isChanged).length;

  const build = (): ReviewResult | null => lesson && {
    set_id: lesson.set.id,
    segment_id: lesson.segment.id,
    model: lesson.set.model,
    reviewer: lesson.reviewer.id,
    reviewer_name: lesson.reviewer.name,
    status: statusRef.current,
    chunks: Object.values(editsRef.current).sort((a, b) => a.index - b.index),
    position: videoRef.current?.currentTime ?? initial?.position ?? 0,
    active_seconds: activeSeconds.current,
    updated_at: new Date().toISOString(),
  };
  const touched = useRef(false);
  const lastSaved = useRef({ position: initial?.position ?? 0, active: initial?.active_seconds ?? 0 });

  function persist(options: { now?: boolean; keepalive?: boolean } = {}) {
    const r = build();
    if (!r) return;
    lastSaved.current = { position: r.position, active: r.active_seconds };
    touched.current = true;
    void saver.save(r, options);
  }
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    persist();
  }, [edits, status]);

  // A finished lesson edited into an invalid state is no longer finished.
  useEffect(() => {
    if (status === 'done' && incomplete.length) setStatus('in_progress');
  }, [status, incomplete.length]);

  // Position and working time: periodically once something was marked, and when the page is left or hidden.
  useEffect(() => {
    if (!lesson) return;
    const progressed = () => touched.current && (
      Math.abs((videoRef.current?.currentTime ?? 0) - lastSaved.current.position) > 1
      || activeSeconds.current - lastSaved.current.active >= 5
    );
    const id = setInterval(() => progressed() && persistRef.current(), PROGRESS_SAVE_MS);
    const leave = () => touched.current && persistRef.current({ now: true, keepalive: true });
    const hidden = () => document.visibilityState === 'hidden' && leave();
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hidden);
      if (touched.current) persistRef.current({ now: true });
    };
  }, [lesson, activeSeconds, videoRef]);

  // patch: corrected text / category / comment of one chunk; back to the original text drops the mark
  function setChunk(index: number, patch: Partial<ChunkReview>) {
    const original = chunks[index]?.text;
    if (original === undefined) return;
    const prev = editsRef.current;
    const next: ChunkReview = { ...(prev[index] ?? { index, corrected: original, category: null }), ...patch };
    if (next.corrected === original) next.category = null;
    const copy = { ...prev };
    if (next.corrected === original && !next.comment) delete copy[index];
    else copy[index] = next;
    setEdits(copy);
  }

  function finish() {
    setStatus('done');
    persist({ now: true });
  }

  return {
    enabled: !!lesson,
    edits,
    setChunk,
    incomplete: incomplete.length,
    changedCount,
    status,
    finish,
    saveState: saver.state,
  };
}
