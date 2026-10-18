import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChunkReview, ErrorCategory, ReviewResult, ReviewSegment, ReviewSet, ReviewStatus } from '../../api/review';
import VideoPlayer from '../stt/VideoPlayer';
import useActiveSeconds from '../../review/useActiveSeconds';
import useReviewSaver, { type SaveState } from '../../review/useReviewSaver';
import ReviewChunkList from './ReviewChunkList';
import { CATEGORIES } from './categories';
import { formatClock } from './format';

export interface Reviewer {
  id: string;
  name: string;
}

interface Props {
  set: ReviewSet;
  segment: ReviewSegment;
  reviewer: Reviewer;
  initial: ReviewResult | null;
  // false while a dialog is open
  keysEnabled: boolean;
  // every saved state, so the list stays current
  onChange: (result: ReviewResult) => void;
  onBack: () => void;
  onFinish: () => void;
  onHelp: () => void;
}

const SKIP_SECONDS = 3;
const SLOW_RATE = 0.75;
// position and working time are saved this often, edits right away
const PROGRESS_SAVE_MS = 15_000;
// ←/→ = back/forward, as in most players, even though the page is RTL. To check with the reviewers.
const BACK_KEY = 'ArrowLeft';
const FORWARD_KEY = 'ArrowRight';
const CATEGORY_KEYS: Record<string, ErrorCategory> = Object.fromEntries(
  CATEGORIES.flatMap((c) => [[`Digit${c.key}`, c.id], [`Numpad${c.key}`, c.id]]),
);

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  saving: 'שומר…',
  saved: 'נשמר ✓',
  error: 'לא נשמר — ננסה שוב',
};

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

export default function SegmentReview({ set, segment, reviewer, initial, keysEnabled, onChange, onBack, onFinish, onHelp }: Props) {
  const { chunks, start, end } = segment;
  const startPosition = initial && initial.position >= start && initial.position < end ? initial.position : start;

  const [edits, setEditsState] = useState<Record<number, ChunkReview>>(
    () => Object.fromEntries((initial?.chunks ?? []).map((c) => [c.index, c])),
  );
  const [status, setStatusState] = useState<ReviewStatus>(initial?.status ?? 'in_progress');
  // Edits and status are also kept in refs, updated at once: several changes within one event
  // (commit + category, finish + leaving the page) must see each other, and so must the save.
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
  const [editing, setEditing] = useState<{ index: number; text: string; typed: boolean } | null>(null);
  const [selected, setSelected] = useState(0);
  const [lastEdited, setLastEdited] = useState<number | null>(null);
  const [commentOpen, setCommentOpen] = useState<number | null>(null);
  const [time, setTime] = useState(startPosition);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeSeconds = useActiveSeconds(initial?.active_seconds ?? 0, playing);
  const saver = useReviewSaver();

  const isChanged = (i: number) => !!editsRef.current[i] && editsRef.current[i].corrected !== chunks[i].text;
  const incomplete = Object.values(edits).filter((e) => e.corrected !== chunks[e.index].text && !e.category);
  const changedCount = Object.keys(edits).filter((i) => isChanged(Number(i))).length;

  // last line that started at or before the playhead
  const active = useMemo(() => {
    let found = -1;
    for (let i = 0; i < chunks.length && chunks[i].start <= time + 0.05; i++) found = i;
    return found;
  }, [chunks, time]);

  useEffect(() => {
    if (active >= 0 && !editing) setSelected(active);
  }, [active]);

  // A finished segment edited into an invalid state is no longer finished.
  useEffect(() => {
    if (status === 'done' && incomplete.length) setStatus('in_progress');
  }, [status, incomplete.length]);

  // --- saving

  const build = (): ReviewResult => ({
    set_id: set.id,
    segment_id: segment.id,
    model: set.model,
    reviewer: reviewer.id,
    reviewer_name: reviewer.name,
    status: statusRef.current,
    chunks: Object.values(editsRef.current).sort((a, b) => a.index - b.index),
    position: videoRef.current?.currentTime ?? time,
    active_seconds: activeSeconds.current,
    updated_at: new Date().toISOString(),
  });
  const buildRef = useRef(build);
  buildRef.current = build;
  const touched = useRef(!!initial);
  const lastSaved = useRef({ position: startPosition, active: initial?.active_seconds ?? 0 });

  function persist(options: { now?: boolean; keepalive?: boolean } = {}) {
    const r = buildRef.current();
    lastSaved.current = { position: r.position, active: r.active_seconds };
    touched.current = true;
    void saver.save(r, options);
    onChange(r);
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

  // Position and working time: periodically, and when the page is left or hidden.
  useEffect(() => {
    const progressed = () => {
      const position = videoRef.current?.currentTime ?? 0;
      return Math.abs(position - lastSaved.current.position) > 1 || activeSeconds.current - lastSaved.current.active >= 5;
    };
    const id = setInterval(() => progressed() && persistRef.current(), PROGRESS_SAVE_MS);
    const leave = () => (touched.current || progressed()) && persistRef.current({ now: true, keepalive: true });
    const hidden = () => document.visibilityState === 'hidden' && leave();
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hidden);
      if (touched.current || progressed()) persistRef.current({ now: true });
    };
  }, [activeSeconds]);

  // --- player, kept within [start, end]

  const video = () => videoRef.current;
  const clamp = (t: number) => Math.min(Math.max(t, start), end);

  function seek(t: number) {
    const v = video();
    if (!v) return;
    v.currentTime = clamp(t);
    setTime(v.currentTime);
  }

  function play() {
    const v = video();
    if (!v) return;
    if (v.currentTime >= end - 0.1) v.currentTime = start;
    void v.play().catch(() => {});
  }

  const pause = () => video()?.pause();
  const togglePlay = () => (video()?.paused ? play() : pause());

  function toggleRate() {
    const next = rate === 1 ? SLOW_RATE : 1;
    if (video()) video()!.playbackRate = next;
    setRate(next);
  }

  function handleTime(t: number) {
    const v = video();
    if (v && t >= end) {
      v.pause();
      v.currentTime = end;
      t = end;
    } else if (v && t < start - 0.5) {
      v.currentTime = start;
      t = start;
    }
    setTime(t);
  }

  useEffect(() => {
    const v = video();
    if (!v) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    v.addEventListener('play', on);
    v.addEventListener('pause', off);
    v.addEventListener('ended', off);
    return () => {
      v.removeEventListener('play', on);
      v.removeEventListener('pause', off);
      v.removeEventListener('ended', off);
    };
  }, []);

  // --- editing

  function setChunk(index: number, patch: Partial<ChunkReview>) {
    const prev = editsRef.current;
    const original = chunks[index].text;
    const next: ChunkReview = { ...(prev[index] ?? { index, corrected: original, category: null }), ...patch };
    if (next.corrected === original) next.category = null;
    const copy = { ...prev };
    if (next.corrected === original && !next.comment) delete copy[index];
    else copy[index] = next;
    setEdits(copy);
  }

  // The latest editing state, for blur handlers that fire after a commit.
  const editingRef = useRef(editing);
  editingRef.current = editing;

  function startEdit(index: number) {
    commit(false);
    setCommentOpen(null);
    setSelected(index);
    setEditing({ index, text: editsRef.current[index]?.corrected ?? chunks[index].text, typed: false });
  }

  function editText(text: string) {
    // Typing while the audio runs is impossible: pause on the first keystroke.
    if (editing && !editing.typed) pause();
    setEditing((e) => e && { ...e, text, typed: true });
  }

  function commit(resume: boolean) {
    const e = editingRef.current;
    if (!e) return;
    editingRef.current = null;
    setEditing(null);
    const corrected = collapse(e.text);
    setChunk(e.index, { corrected });
    if (corrected !== chunks[e.index].text) setLastEdited(e.index);
    if (resume) play();
  }

  function cancel() {
    editingRef.current = null;
    setEditing(null);
  }

  function categorize(category: ErrorCategory, index?: number) {
    // Keys go to the line just corrected while it still needs a category, else to the selected one.
    const target = index ?? (lastEdited != null && isChanged(lastEdited) && !editsRef.current[lastEdited].category ? lastEdited : selected);
    if (!isChanged(target)) return;
    setChunk(target, { category });
    setSelected(target);
  }

  function moveSelection(delta: number) {
    const i = Math.min(Math.max(selected + delta, 0), chunks.length - 1);
    setSelected(i);
    seek(chunks[i].start);
  }

  function replay() {
    if (chunks[selected]) seek(chunks[selected].start);
    play();
  }

  function finish() {
    commit(false);
    setStatus('done');
    persist({ now: true });
    onFinish();
  }

  // --- keyboard: plain keys outside text fields, Alt+key inside them

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inField = target.matches('textarea, input, select, [contenteditable]');
    if ((inField && !e.altKey) || e.metaKey || e.ctrlKey) return;

    if (e.key === '?' && !inField) {
      onHelp();
    } else if (e.code === 'Space') {
      togglePlay();
    } else if (e.code === BACK_KEY) {
      seek((video()?.currentTime ?? time) - SKIP_SECONDS);
    } else if (e.code === FORWARD_KEY) {
      seek((video()?.currentTime ?? time) + SKIP_SECONDS);
    } else if (e.code === 'KeyR') {
      replay();
    } else if (e.code === 'KeyS') {
      toggleRate();
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      commit(false);
      moveSelection(e.code === 'ArrowUp' ? -1 : 1);
    } else if (e.code === 'Enter' && !inField) {
      if (chunks[selected]) startEdit(selected);
    } else if (e.code === 'Escape' && !inField) {
      setCommentOpen(null);
    } else if (CATEGORY_KEYS[e.code]) {
      // in the text field: commit first, the line becomes changed only then
      const index = editingRef.current?.index;
      if (index != null) commit(false);
      categorize(CATEGORY_KEYS[e.code], index);
    } else {
      return;
    }
    e.preventDefault();
  }
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  useEffect(() => {
    if (!keysEnabled) return;
    const handler = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keysEnabled]);

  // --- render

  const duration = end - start;

  return (
    <div className="review-segment">
      <div className="review-bar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>→ לרשימה</button>
        <h2 className="review-bar__title" dir="auto">{segment.title}</h2>
        <span className={`review-save review-save--${saver.state}`} aria-live="polite">{SAVE_LABELS[saver.state]}</span>
        <button type="button" className="icon-btn review-help-btn" title="הוראות ומקשים (?)" onClick={onHelp}>?</button>
      </div>

      <section className="stt review-grid">
        <VideoPlayer
          src={segment.video_url || segment.media_url}
          trackUrl={null}
          trackLabel=""
          videoRef={videoRef}
          onTimeUpdate={handleTime}
          controls={false}
          className={segment.video_url ? undefined : 'player--audio'}
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = startPosition;
            e.currentTarget.playbackRate = rate;
          }}
        >
          <div className="seg-controls" dir="ltr">
            <button type="button" className="seg-controls__play" title="השמעה / עצירה (רווח)" onMouseDown={(e) => e.preventDefault()} onClick={togglePlay}>
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="seg-controls__time">{formatClock(time - start)} / {formatClock(duration)}</span>
            <input
              type="range"
              className="seg-controls__range"
              min={0}
              max={duration}
              step={0.1}
              value={Math.min(Math.max(time - start, 0), duration)}
              onChange={(e) => seek(start + Number(e.target.value))}
              tabIndex={-1}
              aria-label="מיקום בקטע"
            />
            <button type="button" className="seg-controls__rate" title="מהירות (S)" onMouseDown={(e) => e.preventDefault()} onClick={toggleRate}>
              {rate === 1 ? '1×' : `${SLOW_RATE}×`}
            </button>
          </div>
        </VideoPlayer>

        <div className="transcript">
          <div className="transcript__header">
            <span className="transcript__title">{changedCount ? `${changedCount} תיקונים` : 'אין תיקונים'}</span>
            {status === 'done' && <span className="badge">הושלם</span>}
            {incomplete.length > 0 && (
              <span className="badge badge--run">{incomplete.length} ממתינים לסוג טעות</span>
            )}
            <span className="transcript__actions">
              <button type="button" className="btn btn--primary" disabled={incomplete.length > 0} onClick={finish}>
                סיימתי
              </button>
            </span>
          </div>
          <ReviewChunkList
            chunks={chunks}
            offset={start}
            edits={edits}
            editing={editing}
            selected={selected}
            active={active}
            commentOpen={commentOpen}
            onSeek={(i) => {
              setSelected(i);
              seek(chunks[i].start);
              play();
            }}
            onSelect={setSelected}
            onStartEdit={startEdit}
            onEditText={editText}
            onCommit={commit}
            onCancel={cancel}
            onCategory={(i, cat) => categorize(cat, i)}
            onRevert={(i) => setChunk(i, { corrected: chunks[i].text })}
            onToggleComment={(i) => {
              commit(false);
              setSelected(i);
              setCommentOpen((open) => (open === i ? null : i));
            }}
            onCloseComment={() => setCommentOpen(null)}
            onComment={(i, comment) => setChunk(i, { comment: comment || undefined })}
          />
        </div>
      </section>
    </div>
  );
}
