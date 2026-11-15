import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { STT_MODEL } from '../consts';
import { chunksToVtt, startTranscribe, transcriptOf, type Chunk, type SttResult } from '../api/transcribe';
import { resumeJob, waitJob, type Job } from '../api/aiTrns';
import { paragraphsOf, sourcesUsed, startSpeakerParagraphs } from '../api/speakers';
import { fetchUnit, fileUrl, pickFiles } from '../api/kmedia';
import { wordsToSrt } from '../api/tools';
import { formatTime, inputKey, lessonUrl, parseSttInput, type Clip, type SttInput } from '../stt/input';
import {
  DOCX_TYPE, paragraphWords, paragraphsToDocx, paragraphsToLessonDocx, paragraphsToTxt, type LessonDocHeader,
} from '../stt/export';
import { modelWords, wordAt } from '../compare/compare';
import { formatElapsed, saveBlob } from '../utils';
import useObjectUrl from '../hooks/useObjectUrl';
import BusyButton from '../components/stt/BusyButton';
import ErrorAlert from '../components/stt/ErrorAlert';
import VideoPlayer from '../components/stt/VideoPlayer';
import TextColumn, { type ColumnMarks } from '../components/compare/TextColumn';
import '../components/compare/compare.css';

// TASK-stt-new-flow.md: a lesson (or a media link) -> the recognized text right away, then speakers and
// paragraphs (an ai-trns diarize job) in its place. The jobs are in the address (?src=&job=&speakers=), so the
// page can be closed and opened again.

interface Media {
  audio: string;
  video?: string;
  title?: string;
  // the processed audio file's name, without its extension: the downloads are named by it
  name?: string;
  // a kabbalahmedia lesson: its source tells the reader (קריין) apart
  uid?: string;
  // a part of the lesson (its link's sstart / send): only it is processed, the times stay the lesson's
  clip?: Clip;
  // the header of the lesson-style .docx
  doc?: LessonDocHeader;
}

type Stage<T> =
  | { status: 'idle' }
  | { status: 'running'; job?: Job }
  | { status: 'done'; job?: Job; value: T }
  | { status: 'error'; job?: Job; error: string };

const IDLE = { status: 'idle' } as const;
const BAD_INPUT = 'קישור לא תקין. דוגמה: https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo';

// a stale run (a new one started, or the page left) stops polling by throwing this
class Stale extends Error {}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const withoutExt = (name: string) => name.replace(/\.[^./]+$/, '');

// the file's name in a link: https://…/heb_o_rav_….mp3?x=1 -> heb_o_rav_…
function urlFileName(url: string): string | undefined {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? withoutExt(decodeURIComponent(last)) || undefined : undefined;
  } catch {
    return undefined;
  }
}

async function resolveMedia(input: SttInput): Promise<Media> {
  if (input.kind === 'media') return { audio: input.url, name: urlFileName(input.url) };
  const unit = await fetchUnit(input.uid, 'he');
  const { audio, video } = pickFiles(unit);
  if (!audio) throw new Error('לשיעור אין קובץ שמע בשפת המקור');
  const clip = input.clip && clipText(input.clip);
  // a part of the lesson: its times in the files' names (_12m30s-45m0s; no end: _12m30s-)
  const part = input.clip
    ? `_${formatTime(input.clip.start)}-${input.clip.end === null ? '' : formatTime(input.clip.end)}`
    : '';
  return {
    audio: fileUrl(audio),
    video: video && fileUrl(video),
    title: [unit.name, unit.film_date, clip].filter(Boolean).join(' · '),
    name: `${withoutExt(audio.name)}${part}`,
    uid: unit.id,
    clip: input.clip,
    doc: {
      heading: ['תמלול שיעור', unit.film_date && unit.film_date.split('-').reverse().join('.'), clip && `(${clip})`]
        .filter(Boolean).join(' '),
      title: unit.name,
      // as the typed transcripts' files: heb_o_rav_2002-10-14_lesson_…_n1_lT4XU7v9
      name: `${withoutExt(audio.name)}_${unit.id}${part}`,
      link: lessonUrl(unit.id, input.clip),
      ending: input.clip?.end != null ? '(סוף הקטע)' : '(סוף השיעור)',
    },
  };
}

const clipText = (clip: Clip) => `${formatTime(clip.start)}–${clip.end === null ? '' : formatTime(clip.end)}`;

// the player plays the clip only (a media fragment: from its start, pausing at its end)
const withClip = (src: string, clip?: Clip) =>
  clip ? `${src}#t=${clip.start}${clip.end === null ? '' : `,${clip.end}`}` : src;

// a job's time so far, from when it was created (the wait in the queue too)
function jobTime(job: Job | undefined, now: number): string | null {
  if (!job?.created) return null;
  const end = job.finished ?? now / 1000;
  return formatElapsed(Math.max(0, Math.round(end - job.created)));
}

function useNow(running: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

// a problem place the person marked: the time of the line / paragraph, so it stays marked when the view changes
interface Mark {
  start: number;
  end: number;
}

const overlaps = (m: Mark, c: Chunk) => m.start < c.end && m.end > c.start;

export default function Stt() {
  const [params, setParams] = useSearchParams();
  const [link, setLink] = useState(() => params.get('src') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [resolving, setResolving] = useState(false);
  const [recognition, setRecognition] = useState<Stage<SttResult>>(IDLE);
  const [speakers, setSpeakers] = useState<Stage<Chunk[]>>(IDLE);
  // the speakers job got the lesson's source; null: not known (a job opened from the address)
  const [withSource, setWithSource] = useState<boolean | null>(null);
  const [runId, setRunId] = useState(0);
  const run = useRef(0);

  const running = resolving || recognition.status === 'running' || speakers.status === 'running';
  const now = useNow(running);

  // Stage 2: speakers and paragraphs, from a job in the address or a new one. Its failure leaves the text.
  const runSpeakers = useCallback(async (id: number, m: Media, chunks: Chunk[], jobId: string | null) => {
    const stale = () => run.current !== id;
    const onJob = (job: Job) => {
      if (stale()) throw new Stale();
      setSpeakers({ status: 'running', job });
    };
    setSpeakers({ status: 'running' });
    try {
      let job: Job;
      if (jobId) {
        job = await resumeJob(jobId, onJob);
      } else {
        const started = await startSpeakerParagraphs(m.audio, chunks, m.uid, m.clip);
        if (stale()) return;
        setParams((p) => {
          const next = new URLSearchParams(p);
          next.set('speakers', started.job.id);
          return next;
        }, { replace: true });
        job = await waitJob(started.job, onJob);
      }
      const value = await paragraphsOf(job.id);
      if (stale()) return;
      const used = sourcesUsed(job);
      if (used !== null) setWithSource(used.length > 0);
      setSpeakers({ status: 'done', job, value });
    } catch (err) {
      if (err instanceof Stale || stale()) return;
      setSpeakers((s) => ({ status: 'error', job: s.status === 'running' ? s.job : undefined, error: message(err) }));
    }
  }, [setParams]);

  // The whole flow for a lesson / link; jobId / speakersId: jobs already started (from the address)
  const start = useCallback(async (src: string, jobId: string | null, speakersId: string | null) => {
    const id = ++run.current;
    const stale = () => run.current !== id;
    setRunId(id);
    setError(null);
    setMedia(null);
    setRecognition(IDLE);
    setSpeakers(IDLE);
    setWithSource(null);
    const input = parseSttInput(src);
    if (!input) {
      setError(BAD_INPUT);
      return;
    }
    if (input.kind === 'media') setWithSource(false);

    let m: Media;
    setResolving(true);
    try {
      m = await resolveMedia(input);
    } catch (err) {
      if (!stale()) setError(message(err));
      return;
    } finally {
      if (!stale()) setResolving(false);
    }
    if (stale()) return;
    setMedia(m);

    // Stage 1: recognition
    const onJob = (job: Job) => {
      if (stale()) throw new Stale();
      setRecognition({ status: 'running', job });
    };
    setRecognition({ status: 'running' });
    let result: SttResult;
    let job: Job;
    try {
      if (jobId) {
        job = await resumeJob(jobId, onJob);
      } else {
        const created = await startTranscribe(m.audio, m.clip);
        if (stale()) return;
        setParams({ src: inputKey(input), job: created.id }, { replace: true });
        job = await waitJob(created, onJob);
      }
      result = await transcriptOf(job.id);
    } catch (err) {
      if (err instanceof Stale || stale()) return;
      setRecognition((s) => ({ status: 'error', job: s.status === 'running' ? s.job : undefined, error: message(err) }));
      return;
    }
    if (stale()) return;
    setRecognition({ status: 'done', job, value: result });
    if (result.chunks.length > 0) await runSpeakers(id, m, result.chunks, speakersId);
  }, [runSpeakers, setParams]);

  // Opened with jobs in the address: carry on with them. Leaving the page stops the polling.
  useEffect(() => {
    const src = params.get('src');
    if (src) void start(src, params.get('job'), params.get('speakers'));
    return () => {
      run.current++;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on opening the page

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = parseSttInput(link);
    if (!input) return setError(BAD_INPUT);
    setParams({ src: inputKey(input) });
    void start(inputKey(input), null, null);
  }

  function retrySpeakers() {
    if (!media || recognition.status !== 'done') return;
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('speakers');
      return next;
    }, { replace: true });
    void runSpeakers(run.current, media, recognition.value.chunks, null);
  }

  const input = parseSttInput(link);
  const busyText = resolving
    ? 'טוען את השיעור…'
    : recognition.status === 'running'
      ? `מזהה דיבור… ${jobTime(recognition.job, now) ?? ''}`
      : `מזהה דוברים ופסקאות… ${jobTime(speakers.status === 'idle' ? undefined : speakers.job, now) ?? ''}`;

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>תמלול</h1>
          <p className="muted">
            קישור לשיעור ב־kabbalahmedia.info, מזהה השיעור, או קישור ישיר לקובץ שמע / וידאו. הטקסט מוצג מיד אחרי זיהוי
            הדיבור, ואחר כך מתחלק לפסקאות עם הדוברים: הרב, קריין, תלמיד. קישור לקטע מהשיעור (sstart / send) — רק
            הקטע מתומלל.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="stt-url">שיעור או קישור</label>
            <input
              id="stt-url"
              className="input"
              dir="ltr"
              placeholder="https://kabbalahmedia.info/he/lessons/cu/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={running}
            />
            {input?.kind === 'media' && (
              <p className="muted stt-note">
                קישור ישיר, בלי טקסט המקור של השיעור: הקריין יזוהה רק לפי הקול והמשפטים („קטע מספר…”). לזיהוי מדויק — קישור
                לשיעור.
              </p>
            )}
          </div>

          <BusyButton
            loading={running}
            disabled={!input}
            busyText={busyText}
            note="אפשר לסגור את הדף: העבודה שמורה בכתובת שלו, ופתיחתה מחדש תציג את התוצאה."
          >
            תמלל
          </BusyButton>
        </form>

        <ErrorAlert error={error} />

        {recognition.status !== 'idle' && (
          <ol className="stt-stages">
            <StageRow title="זיהוי דיבור" stage={recognition} now={now} />
            <StageRow
              title="דוברים ופסקאות"
              stage={speakers}
              now={now}
              note={withSource === null ? undefined : withSource ? 'עם טקסט המקור' : 'בלי טקסט המקור'}
              onRetry={retrySpeakers}
            />
          </ol>
        )}
        {speakers.status === 'error' && recognition.status === 'done' && (
          <p className="muted stt-note">מוצג הטקסט של זיהוי הדיבור, בלי דוברים ופסקאות.</p>
        )}
        {media?.uid && withSource === false && (
          <p className="muted stt-note">לשיעור לא נמצא טקסט מקור (ליקוטים): הקריין מזוהה רק לפי הקול והמשפטים.</p>
        )}
      </div>

      {media && <SttResultView key={runId} media={media} recognition={recognition} speakers={speakers} params={params} />}
    </>
  );
}

function StageRow<T>({ title, stage, now, note, onRetry }: {
  title: string;
  stage: Stage<T>;
  now: number;
  note?: string;
  onRetry?: () => void;
}) {
  const time = stage.status === 'idle' ? null : jobTime(stage.job, now);
  const job = stage.status === 'running' ? stage.job : undefined;
  const detail = job?.status === 'queued'
    ? `בתור${job.queue_position ? ` (${job.queue_position})` : ''}`
    : job?.stage
      ? `${job.stage}${job.progress != null ? ` ${Math.round(job.progress * 100)}%` : ''}`
      : null;
  const icon = { idle: '·', running: null, done: '✓', error: '✕' }[stage.status];
  return (
    <li className={`stt-stage stt-stage--${stage.status}`}>
      <span className="stt-stage__icon" aria-hidden>{icon ?? <span className="spinner spinner--dark" />}</span>
      <span className="stt-stage__title">{title}</span>
      {time && <span className="stt-stage__time">{time}</span>}
      {detail && <span className="muted" dir="auto">{detail}</span>}
      {note && <span className="muted">· {note}</span>}
      {stage.status === 'error' && (
        <>
          <span className="stt-stage__error" dir="auto">{stage.error}</span>
          {onRetry && <button type="button" className="btn btn--ghost stt-stage__retry" onClick={onRetry}>נסו שוב</button>}
        </>
      )}
    </li>
  );
}

function SttResultView({ media, recognition, speakers, params }: {
  media: Media;
  recognition: Stage<SttResult>;
  speakers: Stage<Chunk[]>;
  params: URLSearchParams;
}) {
  const result = recognition.status === 'done' ? recognition.value : null;
  const paragraphs = speakers.status === 'done' ? speakers.value : null;
  // the view: paragraphs once there, the recognized lines until then
  const chunks = paragraphs ?? (result?.chunks.length ? result.chunks : null);
  const words = useMemo(() => (chunks ? modelWords(chunks) : []), [chunks]);
  const labels = useMemo(() => paragraphs?.map((p) => p.speaker), [paragraphs]);
  const [currentTime, setCurrentTime] = useState(0);
  const [follow, setFollow] = useState(true);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [srtBusy, setSrtBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const trackUrl = useObjectUrl(result?.chunks.length ? chunksToVtt(result.chunks) : null, 'text/vtt');
  const activeWord = useMemo(() => wordAt(words, currentTime), [words, currentTime]);
  const name = media.name || media.uid || 'transcript';

  const seek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, t);
    setFollow(true);
    void video.play().catch(() => {});
  }, []);

  const isMarked = (c: Chunk) => marks.some((m) => overlaps(m, c));
  const markedCount = chunks ? chunks.filter(isMarked).length : 0;

  const columnMarks: ColumnMarks | undefined = chunks ? {
    state: (g) => (chunks[g] && isMarked(chunks[g]) ? 'marked' : null),
    onMark: (g) => {
      const c = chunks[g];
      if (!c) return;
      setMarks((prev) => (prev.some((m) => overlaps(m, c))
        ? prev.filter((m) => !overlaps(m, c))
        : [...prev, { start: c.start, end: c.end }]));
    },
    render: () => null,
  } : undefined;

  async function copyMarked() {
    if (!chunks) return;
    const payload = {
      src: params.get('src'),
      audio: media.audio,
      jobId: params.get('job'),
      speakersJobId: params.get('speakers') ?? undefined,
      problems: chunks.filter(isMarked).map((c) => ({ start: c.start, end: c.end, speaker: c.speaker ?? undefined, text: c.text })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('הועתק');
    } catch {
      alert('שגיאה בהעתקה');
    }
  }

  async function downloadSrt() {
    setExportError(null);
    if (!paragraphs) {
      if (result?.srt) saveBlob(new Blob([result.srt], { type: 'application/x-subrip' }), `${name}.srt`);
      return;
    }
    setSrtBusy(true);
    try {
      const { blob } = await wordsToSrt(paragraphWords(paragraphs));
      saveBlob(blob, `${name}.speakers.srt`);
    } catch (err) {
      setExportError(message(err));
    } finally {
      setSrtBusy(false);
    }
  }

  function downloadTxt() {
    if (!chunks) return;
    const text = paragraphs ? paragraphsToTxt(paragraphs) : chunks.map((c) => c.text).join('\n') + '\n';
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
  }

  async function downloadDocx() {
    if (paragraphs) saveBlob(new Blob([await paragraphsToDocx(paragraphs)], { type: DOCX_TYPE }), `${name}.docx`);
  }

  // laid out as the lessons' typed transcripts (heb_o_rav_…_<uid>.doc)
  async function downloadLessonDocx() {
    if (!paragraphs) return;
    const blob = await paragraphsToLessonDocx(paragraphs, media.doc ?? { title: media.title });
    saveBlob(blob, `${media.doc?.name ?? name}.docx`);
  }

  const stats = chunks && (
    <>
      {paragraphs ? `${chunks.length} פסקאות` : `${chunks.length} שורות`} · {words.length} מילים
      {!follow && (
        <button type="button" className="btn btn--ghost stt-follow" onClick={() => setFollow(true)}>
          ↓ למקום הנוכחי
        </button>
      )}
    </>
  );

  const actions = chunks && (
    <>
      {markedCount > 0 && (
        <button type="button" className="btn btn--ghost" onClick={copyMarked} title="המקומות המסומנים, להעברה לצוות">
          העתקה ({markedCount})
        </button>
      )}
      <button type="button" className="btn btn--ghost" onClick={downloadSrt} disabled={srtBusy}
        title={paragraphs ? 'כתוביות עם הדוברים' : 'כתוביות של זיהוי הדיבור'}>
        {srtBusy ? '…' : 'SRT'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={downloadTxt}>TXT</button>
      {paragraphs && <button type="button" className="btn btn--ghost" onClick={downloadDocx}>DOCX</button>}
      {paragraphs && (
        <button type="button" className="btn btn--ghost" onClick={downloadLessonDocx}
          title="DOCX בעיצוב של קובצי ההקלדה של השיעורים">
          DOCX הקלדה
        </button>
      )}
    </>
  );

  return (
    <section className="stt stt-flow">
      <div className="stt-flow__side">
        <VideoPlayer
          src={withClip(media.video || media.audio, media.clip)}
          trackUrl={trackUrl}
          trackLabel={STT_MODEL}
          videoRef={videoRef}
          onTimeUpdate={setCurrentTime}
        />
        {media.title && <div className="stt-flow__title" dir="auto">{media.title}</div>}
        {chunks && (
          <p className="muted stt-flow__help">
            לחיצה על מילה — ניגון ממנה. ✎ ליד שורה מסמן מקום בעייתי, „העתקה” מעתיקה את המסומנים.
            {paragraphs && ' קטעי הקריאה (קריין) מקופלים: „עוד” פותח.'}
          </p>
        )}
        <ErrorAlert error={exportError} />
      </div>

      {chunks ? (
        <TextColumn
          title={paragraphs ? 'דוברים ופסקאות' : `זיהוי דיבור · ${STT_MODEL}`}
          side="model"
          words={words}
          hunks={[]}
          activeWord={activeWord}
          selected={-1}
          follow={follow}
          onSeek={seek}
          onHunk={() => {}}
          marks={columnMarks}
          labels={labels}
          foldReader
          highlightGroup
          stats={stats}
          actions={actions}
          onUserScroll={() => setFollow(false)}
        />
      ) : (
        <div className="transcript">
          <div className="transcript__header">
            <span className="transcript__title">תמלול</span>
            {recognition.status === 'running' && <span className="badge badge--run">מזהה דיבור…</span>}
            {recognition.status === 'error' && <span className="badge badge--error">שגיאה</span>}
          </div>
          {recognition.status === 'running' && <div className="progress" />}
          <div className="transcript__empty">{result ? 'לא זוהה דיבור' : '—'}</div>
        </div>
      )}
    </section>
  );
}
