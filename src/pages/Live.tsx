import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GOOGLE_CLIENT_ID, LIVE_STREAM_URL } from '../consts';
import { BrowserDocWriter, docId, loadGis } from '../api/gdoc';
import { fetchUnit, fileUrl, parseUnitUid, pickFiles } from '../api/kmedia';
import {
  dropLiveDoc, listenLive, liveConfig, liveResult, setLiveDoc, startLive, stopLive,
  type DocMode, type LiveConfig, type LiveEvent, type LiveWord,
} from '../api/live';
import useObjectUrl from '../hooks/useObjectUrl';
import { exportFileName, transcriptBlob } from '../review/exportTranscript';
import ErrorAlert from '../components/stt/ErrorAlert';
import VideoPlayer from '../components/stt/VideoPlayer';
import '../components/live/live.css';

// Live transcription (תמלול חי), TASK-live-transcription.md in ai-trns: the broadcast (LIVE_STREAM_URL, HLS)
// or a recording, which the server reads at its natural pace as if it were broadcast; the text comes in while
// the player plays it.

interface Media {
  audio: string;
  video?: string;
  title?: string;
  // the broadcast: no timeline to highlight words on or seek in
  stream?: boolean;
}

type Source = 'broadcast' | 'link';

type State = 'idle' | 'waiting' | 'live' | 'stopping' | 'ended';

// the job's Google Doc, as the "doc" events tell every listener
interface Doc {
  url: string;
  title?: string;
  mode: DocMode;
  by?: string;
}

const STATE_LABELS: Record<State, string> = {
  idle: '',
  waiting: 'ממתין לשרת…',
  live: 'בשידור',
  stopping: 'עוצר…',
  ended: 'הסתיים',
};

// a word stays highlighted this long after its end, across short pauses
const HIGHLIGHT_TAIL = 0.6;

// A kabbalahmedia.info lesson link -> its Hebrew audio (and video); otherwise a direct media link.
async function resolveMedia(link: string): Promise<Media> {
  if (/\.(m3u8|mpd)(\?|$)/i.test(new URL(link, window.location.href).pathname + '?')) {
    return { audio: link, stream: true };
  }
  const uid = parseUnitUid(link);
  if (uid) {
    const unit = await fetchUnit(uid);
    const { audio, video } = pickFiles(unit);
    if (!audio) throw new Error('לשיעור אין קובץ שמע בשפת המקור');
    return { audio: fileUrl(audio), video: video && fileUrl(video), title: unit.name };
  }
  try {
    const url = new URL(link.trim());
    if (url.protocol === 'https:' || url.protocol === 'http:') return { audio: url.href };
  } catch {
    // not a URL
  }
  throw new Error('קישור לא תקין. דוגמה: https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo');
}

// the final word being played: words are in time order
function wordAt(words: LiveWord[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start_s <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && t <= words[found].end_s + HIGHLIGHT_TAIL ? found : -1;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// HLS in a <video>: natively in Safari, through hls.js elsewhere. Returns a cleanup.
async function attachStream(video: HTMLVideoElement, url: string): Promise<() => void> {
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    return () => video.removeAttribute('src');
  }
  const { default: Hls } = await import('hls.js');
  const hls = new Hls({ liveSyncDurationCount: 3 });
  hls.loadSource(url);
  hls.attachMedia(video);
  return () => hls.destroy();
}

export default function Live() {
  const [source, setSource] = useState<Source>(LIVE_STREAM_URL ? 'broadcast' : 'link');
  const [link, setLink] = useState('https://cdn.kabbalahmedia.info/K8X56H7k');
  const [media, setMedia] = useState<Media | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [finals, setFinals] = useState<LiveWord[]>([]);
  const [partial, setPartial] = useState<LiveWord[]>([]);
  const [heard, setHeard] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showPartial, setShowPartial] = useState(true);
  const [follow, setFollow] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [srt, setSrt] = useState<string | null>(null);
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [docLink, setDocLink] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  // this page writing the doc as its user (mode "browser")
  const writer = useRef<BrowserDocWriter | null>(null);
  const finalsRef = useRef<LiveWord[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const srtUrl = useObjectUrl(srt, 'application/x-subrip');

  const busy = state === 'waiting' || state === 'live' || state === 'stopping';
  const stream = !!media?.stream;
  const current = stream ? -1 : wordAt(finals, currentTime);
  const lastEnd = finals.length ? finals[finals.length - 1].end_s : 0;

  finalsRef.current = finals;

  // leaving the page stops listening (and this page's writing of the doc)
  useEffect(() => () => {
    abort.current?.abort();
    void writer.current?.stop();
  }, []);

  // the consent popup must open right on the click: have Google's script ready before it
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) loadGis().catch(() => {});
  }, []);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  useEffect(() => {
    const el = textRef.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [finals, partial, follow]);

  useEffect(() => {
    const video = videoRef.current;
    if (!media?.stream || !video) return;
    let cleanup: (() => void) | null = null;
    let gone = false;
    attachStream(video, media.audio).then(
      (c) => (gone ? c() : (cleanup = c)),
      (err) => setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      gone = true;
      cleanup?.();
    };
  }, [media]);

  function play() {
    const video = videoRef.current;
    if (!video) return;
    // a recording plays from where the server starts reading it; the broadcast from its live edge
    if (!media?.stream) video.currentTime = 0;
    video.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }

  function onEvent(e: LiveEvent, id: string) {
    switch (e.type) {
      case 'start':
        setState('live');
        play();
        break;
      case 'final':
        setFinals((prev) => [...prev, ...e.words]);
        writer.current?.push(e.words.map((w) => w.word));
        break;
      case 'doc':
        if (e.error) {
          setDocError(e.error);
          break;
        }
        setDocError(null);
        setDoc(e.url ? { url: e.url, title: e.title, mode: e.mode ?? 'server', by: e.by } : null);
        // someone else took over the doc: this page stops writing it
        if (writer.current && (!e.url || e.mode !== 'browser' || docId(e.url) !== writer.current.id)) {
          void writer.current.stop();
          writer.current = null;
        }
        break;
      case 'partial':
        setPartial(e.words);
        if (e.end_s != null) setHeard(e.end_s);
        break;
      case 'reset':
        setFinals([]);
        setPartial([]);
        break;
      case 'end':
        setPartial([]);
        setState('ended');
        void writer.current?.stop();
        writer.current = null;
        liveResult(id, 'srt').then(setSrt, (err) => setError(err instanceof Error ? err.message : String(err)));
        break;
      case 'error':
        setPartial([]);
        setState('ended');
        setError(e.message ?? 'התמלול נכשל');
        videoRef.current?.pause();
        break;
    }
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    abort.current?.abort();
    setError(null);
    setNote(null);
    setDoc(null);
    setDocError(null);
    void writer.current?.stop();
    writer.current = null;
    setFinals([]);
    setPartial([]);
    setHeard(0);
    setSrt(null);
    setBlocked(false);
    setFollow(true);
    setState('waiting');
    const controller = new AbortController();
    abort.current = controller;
    // a page that goes away just stops listening: a job nobody listens to is finished by the server
    try {
      const m = await resolveMedia(source === 'broadcast' && LIVE_STREAM_URL ? LIVE_STREAM_URL : link);
      setMedia(m);
      const id = await startLive(m.audio);
      setJobId(id);
      liveConfig().then(setConfig, () => setConfig(null));
      await listenLive(id, (ev) => onEvent(ev, id), controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setState('ended');
    }
  }

  async function handleStop() {
    if (!jobId) return;
    setState('stopping');
    videoRef.current?.pause();
    try {
      const { stopping, listeners } = await stopLive(jobId);
      if (!stopping) {
        // others still listen: the broadcast goes on for them, this page leaves it
        abort.current?.abort();
        setPartial([]);
        setState('ended');
        setNote(`השידור ממשיך עבור ${listeners} מאזינים נוספים`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function seek(t: number) {
    const video = videoRef.current;
    if (!video || stream) return;
    video.currentTime = t;
    void video.play().catch(() => {});
  }

  function onScroll() {
    const el = textRef.current;
    if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  async function attachDoc(mode: DocMode) {
    if (!jobId) return;
    const id = docId(docLink);
    if (!id) {
      setDocError('קישור למסמך Google Docs: https://docs.google.com/document/d/...');
      return;
    }
    setDocBusy(true);
    setDocError(null);
    try {
      if (mode === 'browser') {
        const w = await BrowserDocWriter.open(GOOGLE_CLIENT_ID!, id, setDocError);
        // what is final so far first, then each new final event
        w.push(finalsRef.current.map((f) => f.word));
        void writer.current?.stop();
        writer.current = w;
      }
      await setLiveDoc(jobId, docLink, mode);
      setDocLink('');
    } catch (err) {
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setDocBusy(false);
    }
  }

  async function detachDoc() {
    if (!jobId) return;
    void writer.current?.stop();
    writer.current = null;
    await dropLiveDoc(jobId).catch((err) => setDocError(err instanceof Error ? err.message : String(err)));
  }

  const serverAccount = config?.google_service_account;
  const canDoc = !!(serverAccount || GOOGLE_CLIENT_ID);

  async function copyText() {
    await navigator.clipboard.writeText(finals.map((w) => w.word).join(' ')).catch(() => {});
  }

  // txt / docx of the final words so far (during the stream too); SRT is the server's, at the end
  async function download(format: 'txt' | 'docx') {
    const text = finals.map((w) => w.word).join(' ');
    const blob = await transcriptBlob([{ start: 0, end: lastEnd, text }], format);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(`${media?.title ?? 'תמלול חי'} ${stamp}`, format);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="live">
      <div className="live__side">
        <h1 className="live__h1">תמלול חי</h1>
        <form onSubmit={handleStart} className="live__form">
          {LIVE_STREAM_URL && (
            <div className="live__source">
              <label className="live__option">
                <input type="radio" name="live-source" checked={source === 'broadcast'} disabled={busy}
                  onChange={() => setSource('broadcast')} />
                שידור חי
              </label>
              <label className="live__option">
                <input type="radio" name="live-source" checked={source === 'link'} disabled={busy}
                  onChange={() => setSource('link')} />
                שיעור / קובץ
              </label>
            </div>
          )}
          {source === 'link' && (
            <input
              id="live-url"
              type="text"
              className="input"
              dir="ltr"
              aria-label="קישור"
              placeholder="https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={busy}
            />
          )}
          {busy ? (
            <button type="button" className="btn btn--block live__stop" onClick={handleStop}
              disabled={state !== 'live'}>
              {state === 'waiting' ? (
                <>
                  <span className="spinner" aria-hidden />
                  {STATE_LABELS.waiting}
                </>
              ) : (
                'עצור'
              )}
            </button>
          ) : (
            <button type="submit" className="btn btn--primary btn--block"
              disabled={source === 'link' && !link.trim()}>
              התחל תמלול
            </button>
          )}
        </form>
        <ErrorAlert error={error} />
        {note && <p className="muted">{note}</p>}

        {media && (
          <>
            {stream ? (
              <div className="player live__player">
                <video ref={videoRef} controls playsInline />
              </div>
            ) : (
              <VideoPlayer
                src={media.video ?? media.audio}
                trackUrl={null}
                trackLabel=""
                videoRef={videoRef}
                onTimeUpdate={setCurrentTime}
                className="live__player"
              />
            )}
            {blocked && (
              <button type="button" className="btn btn--primary btn--block" onClick={play}>
                ▶ הפעל את הנגן
              </button>
            )}
            {(media.title || stream) && <div className="live__title">{media.title ?? 'שידור חי'}</div>}
          </>
        )}
        <div className="live__status">
          {state !== 'idle' && <span className={`live__pill live__pill--${state}`}>{STATE_LABELS[state]}</span>}
          {state === 'live' && (
            <span className="muted" title="עד כאן השרת שמע / עד כאן הטקסט סופי">
              שמע {fmt(heard)} · טקסט {fmt(lastEnd)}
            </span>
          )}
        </div>
        <label className="live__option">
          <input type="checkbox" checked={showPartial} onChange={(e) => setShowPartial(e.target.checked)} />
          הצג טקסט זמני (אפור)
        </label>
        <div className="live__buttons">
          <button type="button" className="btn" onClick={copyText} disabled={!finals.length}>העתק</button>
          <button type="button" className="btn" onClick={() => download('txt')} disabled={!finals.length}>TXT</button>
          <button type="button" className="btn" onClick={() => download('docx')} disabled={!finals.length}>DOCX</button>
          {srtUrl && <a className="btn" href={srtUrl} download={`${jobId}.srt`}>SRT</a>}
        </div>

        {jobId && canDoc && (busy || doc) && (
          <div className="live__doc">
            <div className="live__doc-title">Google Doc</div>
            {doc ? (
              <>
                <a href={doc.url} target="_blank" rel="noreferrer" dir="auto">{doc.title || 'המסמך'}</a>
                <span className="muted">
                  {doc.mode === 'server' ? 'נכתב מהשרת' : `נכתב מהדפדפן${doc.by ? ` של ${doc.by}` : ''}`}
                  {' · '}עריכות במסמך נשמרות עם שם העורך
                </span>
                {busy && <button type="button" className="btn" onClick={detachDoc}>הפסק לכתוב למסמך</button>}
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="input"
                  dir="ltr"
                  aria-label="קישור ל-Google Doc"
                  placeholder="https://docs.google.com/document/d/..."
                  value={docLink}
                  onChange={(e) => setDocLink(e.target.value)}
                  disabled={docBusy}
                />
                <div className="live__buttons">
                  {serverAccount && (
                    <button type="button" className="btn" onClick={() => attachDoc('server')}
                      disabled={docBusy || !docLink.trim()}>כתוב מהשרת</button>
                  )}
                  {GOOGLE_CLIENT_ID && (
                    <button type="button" className="btn" onClick={() => attachDoc('browser')}
                      disabled={docBusy || !docLink.trim()}>כתוב מחשבון Google שלי</button>
                  )}
                </div>
                {serverAccount && (
                  <span className="muted live__doc-hint">
                    לכתיבה מהשרת שתפו את המסמך כעורך עם <span dir="ltr">{serverAccount}</span>
                  </span>
                )}
                {GOOGLE_CLIENT_ID && (
                  <span className="muted live__doc-hint">מחשבון שלכם: כותב רק כל עוד הדף פתוח</span>
                )}
              </>
            )}
            {docError && <div className="alert alert--error" role="alert" dir="auto">{docError}</div>}
          </div>
        )}
      </div>

      <div className="live__text-wrap">
        <div className="live__text" ref={textRef} onScroll={onScroll}>
          {!finals.length && !partial.length && (
            <p className="muted">
              {state === 'waiting' ? 'ממתין לשרת…' : 'השידור החי, או קישור לשיעור / קובץ שהשרת מתמלל בקצב השמעה — הטקסט יופיע כאן תוך כדי ניגון.'}
            </p>
          )}
          {finals.map((w, i) => (
            <span key={i}>
              <span
                className={i === current ? 'lw lw--now' : stream ? 'lw lw--static' : 'lw'}
                onClick={() => seek(w.start_s)}
                title={fmt(w.start_s)}
              >
                {w.word}
              </span>{' '}
            </span>
          ))}
          {showPartial && <span className="lw--partial">{partial.map((w) => w.word).join(' ')}</span>}
        </div>
        {!follow && (
          <button type="button" className="btn live__follow" onClick={() => setFollow(true)}>
            ↓ לסוף
          </button>
        )}
      </div>
    </div>
  );
}
