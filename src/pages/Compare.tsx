import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fetchUnit, fileUrl, parseUnitUid, pickFiles } from '../api/kmedia';
import { transcribe, /* transcribeSttApi, */ type Chunk, type SttResult } from '../api/transcribe';
import { compare, suggestCorrection, wordAt, type Comparison } from '../compare/compare';
import { isTranscriptFile, readTranscript } from '../compare/readTranscript';
import { loadReviewLesson, type LessonFiles, type ReviewLesson } from '../compare/reviewLesson';
import useChunkMarks from '../compare/useChunkMarks';
import { formatElapsed } from '../utils';
import useElapsed from '../hooks/useElapsed';
import BusyButton from '../components/stt/BusyButton';
import ErrorAlert from '../components/stt/ErrorAlert';
import FileDrop from '../components/stt/FileDrop';
import VideoPlayer from '../components/stt/VideoPlayer';
import { SAVE_LABELS } from '../components/review/SegmentReview';
import ChunkMark from '../components/compare/ChunkMark';
import TextColumn, { type ColumnMarks } from '../components/compare/TextColumn';
import '../components/review/review.css';
import '../components/compare/compare.css';

// TASK-transcript-compare.md: a person's transcript of a lesson against the model's, over the audio.

interface Media {
  audio: string;
  video?: string;
  title?: string;
  // a kabbalahmedia lesson (what בדיקת תמלול needs to add it)
  lesson?: LessonFiles;
}

// Where the model's transcript comes from -- all through ai-trns, picked by the link: a kabbalahmedia lesson
// -> "review", its transcript in בדיקת תמלול (the set's, added there if missing), the only one the model's
// mistakes can be marked on, into the same review; any other link -> an ai-trns job.
// The choice between ai-trns and stt-api is switched off (commented out below); stt-api: transcribeSttApi.
type Source = 'review' | 'ai-trns' /* | 'stt-api' */;

const SOURCE_LABELS: Record<Source, string> = {
  review: 'בדיקת תמלול',
  'ai-trns': 'ai-trns',
  // 'stt-api': 'stt-api',
};

const TRANSCRIBE: Record<Exclude<Source, 'review'>, (url: string) => Promise<SttResult>> = {
  'ai-trns': transcribe,
  // 'stt-api': transcribeSttApi,
};

interface Result {
  media: Media;
  source: Source;
  comparison: Comparison;
  // source "review": the lesson in the set, its transcript is the model's chunks
  lesson: ReviewLesson | null;
}

// a difference plays from a moment before it
const PREROLL = 1;
// the model's transcript of the last lesson, so comparing again (an edited text) doesn't wait for it
const CACHE_KEY = 'compare-stt';

function cachedChunks(audio: string, source: Source): Chunk[] | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return cached?.audio === audio && (cached.source ?? 'ai-trns') === source ? cached.chunks : null;
  } catch {
    return null;
  }
}

function cacheChunks(audio: string, source: Source, chunks: Chunk[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ audio, source, chunks }));
  } catch {
    // full or blocked: transcribed again next time
  }
}

// A kabbalahmedia.info lesson link -> its Hebrew audio (and video); otherwise a direct media link.
async function resolveMedia(link: string): Promise<Media> {
  const uid = parseUnitUid(link);
  if (uid) {
    const unit = await fetchUnit(uid);
    const { audio, video } = pickFiles(unit);
    if (!audio) throw new Error('לשיעור אין קובץ שמע בשפת המקור');
    return {
      audio: fileUrl(audio),
      video: video && fileUrl(video),
      title: unit.name,
      lesson: {
        uid: unit.id,
        title: [unit.name, unit.film_date].filter(Boolean).join(' · '),
        audioFileId: audio.id,
        videoFileId: video?.id,
        duration: unit.duration ?? audio.duration ?? 0,
      },
    };
  }
  try {
    const url = new URL(link.trim());
    if (url.protocol === 'https:' || url.protocol === 'http:') return { audio: url.href };
  } catch {
    // not a URL
  }
  throw new Error('קישור לא תקין. דוגמה: https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo');
}

export default function Compare() {
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  // source "review": the server is still transcribing the lesson it was just given
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // a new result remounts the result view (its marks are per lesson)
  const [runs, setRuns] = useState(0);
  const unmounted = useRef(false);
  const elapsed = useElapsed(loading);

  useEffect(() => () => {
    unmounted.current = true;
  }, []);

  useEffect(() => {
    if (!loading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [loading]);

  async function pickFile(f: File | null) {
    setFile(f);
    if (!f) return;
    setError(null);
    try {
      setText(await readTranscript(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFile(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!link.trim() || !text.trim()) return;
    setLoading(true);
    setWaiting(false);
    setError(null);
    try {
      const media = await resolveMedia(link);
      let source: Source;
      let chunks: Chunk[];
      let lesson: ReviewLesson | null = null;
      if (media.lesson) {
        source = 'review';
        lesson = await loadReviewLesson(media.lesson, () => setWaiting(true), () => unmounted.current);
        chunks = lesson.segment.chunks;
      } else {
        source = 'ai-trns';
        const cached = cachedChunks(media.audio, source);
        chunks = cached ?? (await TRANSCRIBE[source](media.audio)).chunks;
        if (!cached) cacheChunks(media.audio, source, chunks);
      }
      setResult({ media, source, lesson, comparison: compare(text, chunks) });
      setRuns((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setWaiting(false);
    }
  }

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>השוואת תמלול</h1>
          <p className="muted">
            קישור לשיעור והתמלול שלכם — הם יושוו לתמלול אוטומטי של השמע. ההבדלים מסומנים בשני הטקסטים, לחיצה משמיעה את המקום.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="compare-link">קישור לשיעור</label>
            <input
              id="compare-link"
              type="url"
              className="input"
              dir="ltr"
              placeholder="https://kabbalahmedia.info/he/lessons/cu/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={loading}
            />
          </div>

          <FileDrop
            label="התמלול שלכם"
            hint="DOCX או TXT"
            icon="📄"
            accept=".docx,.txt,text/plain"
            matches={isTranscriptFile}
            file={file}
            onChange={pickFile}
            disabled={loading}
          />
          <p className="or">או הדביקו את הטקסט</p>
          <div className="field">
            <textarea
              className="input compare-text"
              dir="auto"
              aria-label="התמלול שלכם"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* The source choice is switched off: everything goes through ai-trns (see Source above).
          <div className="field">
            <span className="field__label">תמלול אוטומטי מ־</span>
            <div className="compare-source">
              {(Object.keys(SOURCE_LABELS) as Source[]).map((key) => (
                <label key={key} className="compare-source__option">
                  <input
                    type="radio"
                    name="compare-source"
                    checked={source === key}
                    onChange={() => setSource(key)}
                    disabled={loading}
                  />
                  <span dir="auto">{SOURCE_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>
          */}
          <p className="muted compare-note">
            שיעור מ־kabbalahmedia.info מושווה לתמלול השמור שלו בבדיקת תמלול (שיעור שאינו שם יתווסף לרשימה ויתומלל),
            וטעויות של המודל שתסמנו נשמרות כבדיקה שלכם של השיעור.
          </p>

          <BusyButton
            loading={loading}
            disabled={!link.trim() || !text.trim()}
            busyText={`${waiting ? 'השיעור מתומלל בשרת…' : 'מתמלל את השמע…'} ${formatElapsed(elapsed)}`}
            note="התמלול האוטומטי עשוי להימשך מספר דקות, אל תסגרו את הדף."
          >
            {result ? 'השוואה מחדש' : 'השוואה'}
          </BusyButton>
        </form>

        <ErrorAlert error={error} />
      </div>

      {result && <CompareResult key={runs} result={result} />}
    </>
  );
}

function CompareResult({ result }: { result: Result }) {
  const { comparison, lesson } = result;
  const hunks = comparison.hunks;
  const [currentTime, setCurrentTime] = useState(0);
  const [selected, setSelected] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [playing, setPlaying] = useState(false);
  // the chunk whose mark is being edited, and the text the editor starts with
  const [editing, setEditing] = useState<{ chunk: number; text: string; seq: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const marks = useChunkMarks(lesson, videoRef, playing);
  const chunks = lesson?.segment.chunks ?? [];

  useEffect(() => {
    const v = videoRef.current;
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

  const seek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, t);
    void video.play().catch(() => {});
  }, []);

  const selectHunk = useCallback(
    (i: number) => {
      const h = hunks[i];
      if (!h) return;
      setSelected(i);
      seek(h.time - PREROLL);
    },
    [hunks, seek],
  );

  // from the selected difference, or (none selected) from the playhead
  function step(dir: 1 | -1) {
    if (selected >= 0) return selectHunk(selected + dir);
    const next = hunks.findIndex((h) => h.time >= currentTime);
    selectHunk(dir > 0 ? (next < 0 ? hunks.length - 1 : next) : (next < 0 ? hunks.length : next) - 1);
  }

  // Typing while the audio runs is impossible: editing a mark pauses it.
  function openEditor(chunk: number, text: string) {
    videoRef.current?.pause();
    setEditing((e) => ({ chunk, text, seq: (e?.seq ?? 0) + 1 }));
  }

  // the selected difference as the model's mistake: its chunk, with the person's words in it
  function markHunk() {
    const s = suggestCorrection(comparison, selected);
    if (s) openEditor(s.chunk, s.text);
  }

  const columnMarks: ColumnMarks | undefined = marks.enabled ? {
    state: (g) => {
      const e = marks.edits[g];
      if (!e || e.corrected === chunks[g]?.text) return null;
      return e.category ? 'marked' : 'incomplete';
    },
    onMark: (g) => chunks[g] && openEditor(g, marks.edits[g]?.corrected ?? chunks[g].text),
    render: (g) => {
      const isEditing = editing?.chunk === g;
      if (!isEditing && !marks.edits[g]) return null;
      return (
        <ChunkMark
          key={isEditing ? `e${editing.seq}` : 'view'}
          original={chunks[g].text}
          edit={marks.edits[g]}
          editing={isEditing ? editing.text : null}
          onStartEdit={() => openEditor(g, marks.edits[g]?.corrected ?? chunks[g].text)}
          onCommit={(corrected) => {
            marks.setChunk(g, { corrected });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
          onCategory={(category) => marks.setChunk(g, { category })}
          onComment={(comment) => marks.setChunk(g, { comment: comment || undefined })}
          onRevert={() => marks.setChunk(g, { corrected: chunks[g].text, comment: undefined })}
        />
      );
    },
  } : undefined;

  const activeHuman = useMemo(() => wordAt(comparison.human, currentTime), [comparison, currentTime]);
  const activeModel = useMemo(() => wordAt(comparison.model, currentTime), [comparison, currentTime]);
  const hunk = hunks[selected];

  return (
    <section className="compare">
      <div className="compare__top">
        <VideoPlayer
          className="compare__player"
          src={result.media.video || result.media.audio}
          trackUrl={null}
          trackLabel=""
          videoRef={videoRef}
          onTimeUpdate={setCurrentTime}
        />

        <div className="compare__nav">
          {result.media.title && <div className="compare__title" dir="auto">{result.media.title}</div>}
          <div className="compare__count">
            {hunks.length === 0
              ? 'אין הבדלים'
              : hunk
                ? `הבדל ${selected + 1} מתוך ${hunks.length}`
                : `${hunks.length} הבדלים`}
          </div>
          {hunk && (
            <dl className="compare__hunk">
              <dt>אצלכם</dt>
              <dd dir="auto" className={hunk.human ? 'compare__human' : 'compare__missing'}>{hunk.human || 'חסר'}</dd>
              <dt>במודל</dt>
              <dd dir="auto" className={hunk.model ? 'compare__model' : 'compare__missing'}>{hunk.model || 'חסר'}</dd>
            </dl>
          )}
          <div className="compare__buttons">
            <button type="button" className="btn btn--ghost" onClick={() => step(-1)} disabled={hunks.length === 0 || selected === 0}>
              → הקודם
            </button>
            {hunk && (
              <button type="button" className="btn btn--ghost" onClick={() => selectHunk(selected)}>▶ שוב</button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => step(1)}
              disabled={hunks.length === 0 || selected === hunks.length - 1}
            >
              הבא ←
            </button>
            {marks.enabled && hunk && (
              <button type="button" className="btn btn--ghost" onClick={markHunk} title="תיקון השורה של המודל לפי הטקסט שלכם">
                ✎ טעות של המודל
              </button>
            )}
          </div>
          <label className="compare__follow">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            הטקסט עוקב אחרי השמע
          </label>
          <p className="muted compare__legend">
            <span className="cw cw--diff compare-col--human">אצלכם</span> / <span className="cw cw--diff compare-col--model">במודל</span>{' '}
            — מילים שונות · <span className="cw-gap">⁁</span> — חסרות מילים
          </p>

          {marks.enabled && (
            <div className="compare__review">
              <span>{marks.changedCount ? `${marks.changedCount} טעויות מסומנות` : 'אין טעויות מסומנות'}</span>
              {marks.incomplete > 0 && <span className="badge badge--run">{marks.incomplete} ממתינים לסוג טעות</span>}
              {marks.status === 'done' && <span className="badge">הושלם</span>}
              <span className={`review-save review-save--${marks.saveState}`} aria-live="polite">{SAVE_LABELS[marks.saveState]}</span>
              <button
                type="button"
                className="btn btn--primary compare__finish"
                disabled={marks.incomplete > 0 || marks.status === 'done'}
                onClick={marks.finish}
                title="הבדיקה של השיעור הושלמה (נספרת בדוח של בדיקת תמלול)"
              >
                סיימתי
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="compare__cols">
        <TextColumn
          title="התמלול שלכם"
          side="human"
          words={comparison.human}
          hunks={hunks}
          activeWord={activeHuman}
          selected={selected}
          follow={follow}
          onSeek={seek}
          onHunk={selectHunk}
        />
        <TextColumn
          title={`תמלול אוטומטי · ${SOURCE_LABELS[result.source]}`}
          side="model"
          words={comparison.model}
          hunks={hunks}
          activeWord={activeModel}
          selected={selected}
          follow={follow && editing === null}
          onSeek={seek}
          onHunk={selectHunk}
          marks={columnMarks}
        />
      </div>
    </section>
  );
}
