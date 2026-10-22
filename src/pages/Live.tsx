import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LIVE_STREAM_URL } from '../consts';
import { fetchUnit, fileUrl, parseUnitUid, pickFiles } from '../api/kmedia';
import { cancelLive, listenLive, liveResult, startLive, stopLive, type LiveEvent, type LiveWord } from '../api/live';
import useObjectUrl from '../hooks/useObjectUrl';
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
  const [finals, setFinals] = useState<LiveWord[]>([]);
  const [partial, setPartial] = useState<LiveWord[]>([]);
  const [heard, setHeard] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showPartial, setShowPartial] = useState(true);
  const [follow, setFollow] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [srt, setSrt] = useState<string | null>(null);
  const [txt, setTxt] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const srtUrl = useObjectUrl(srt, 'application/x-subrip');
  const txtUrl = useObjectUrl(txt, 'text/plain');

  const busy = state === 'waiting' || state === 'live' || state === 'stopping';
  const stream = !!media?.stream;
  const current = stream ? -1 : wordAt(finals, currentTime);
  const lastEnd = finals.length ? finals[finals.length - 1].end_s : 0;

  // leaving the page ends the stream on the server too
  useEffect(() => () => abort.current?.abort(), []);

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
        Promise.all([liveResult(id, 'srt'), liveResult(id, 'txt')]).then(
          ([s, t]) => {
            setSrt(s);
            setTxt(t);
          },
          (err) => setError(err instanceof Error ? err.message : String(err)),
        );
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
    setFinals([]);
    setPartial([]);
    setHeard(0);
    setSrt(null);
    setTxt(null);
    setBlocked(false);
    setFollow(true);
    setState('waiting');
    const controller = new AbortController();
    abort.current = controller;
    let id: string | null = null;
    try {
      const m = await resolveMedia(source === 'broadcast' && LIVE_STREAM_URL ? LIVE_STREAM_URL : link);
      setMedia(m);
      id = await startLive(m.audio);
      setJobId(id);
      const jobIdNow = id;
      await listenLive(jobIdNow, (ev) => onEvent(ev, jobIdNow), controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setState('ended');
    } finally {
      // the page went away or a new stream started: this one is not needed anymore
      if (controller.signal.aborted && id) void cancelLive(id);
    }
  }

  async function handleStop() {
    if (!jobId) return;
    setState('stopping');
    videoRef.current?.pause();
    try {
      await stopLive(jobId);
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

  async function copyText() {
    await navigator.clipboard.writeText(finals.map((w) => w.word).join(' ')).catch(() => {});
  }

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>תמלול חי</h1>
          <p className="muted">
            השידור החי, או קישור לשיעור / קובץ שהשרת מתמלל בקצב השמעה — הטקסט מופיע תוך כדי ניגון.
          </p>
        </header>
        <form onSubmit={handleStart}>
          {LIVE_STREAM_URL && (
            <div className="field live__source">
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
          {source === 'link' && <div className="field">
            <label className="field__label" htmlFor="live-url">קישור</label>
            <input
              id="live-url"
              type="text"
              className="input"
              dir="ltr"
              placeholder="https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={busy}
            />
          </div>}
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
              התחל
            </button>
          )}
        </form>
        <ErrorAlert error={error} />
      </div>

      {media && (
        <div className="live">
          <div className="live__side">
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
              {srtUrl && <a className="btn" href={srtUrl} download={`${jobId}.srt`}>SRT</a>}
              {txtUrl && <a className="btn" href={txtUrl} download={`${jobId}.txt`}>TXT</a>}
            </div>
          </div>

          <div className="live__text-wrap">
            <div className="live__text" ref={textRef} onScroll={onScroll}>
              {!finals.length && !partial.length && (
                <p className="muted">{state === 'waiting' ? 'ממתין לשרת…' : 'הטקסט יופיע כאן תוך כמה שניות.'}</p>
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
      )}
    </>
  );
}
