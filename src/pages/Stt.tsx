import { useMemo, useRef, useState, type FormEvent } from 'react';
import { STT_MODEL } from '../consts';
import { chunksToVtt, transcribe, type SttResult } from '../api/transcribe';
import { formatElapsed } from '../utils';
import useElapsed from '../hooks/useElapsed';
import useObjectUrl from '../hooks/useObjectUrl';
import BusyButton from '../components/stt/BusyButton';
import ErrorAlert from '../components/stt/ErrorAlert';
import VideoPlayer from '../components/stt/VideoPlayer';
import ChunkList from '../components/stt/ChunkList';

const SAFE_MEDIA_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);

function sanitizeMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return SAFE_MEDIA_PROTOCOLS.has(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export default function Stt() {
  const [url, setUrl] = useState('https://cdn.kabbalahmedia.info/K8X56H7k');
  const [videoUrl, setVideoUrl] = useState('https://cdn.kabbalahmedia.info/cADzhBzb');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SttResult | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsed = useElapsed(loading);

  const trimmedUrl = sanitizeMediaUrl(url);
  const trimmedVideoUrl = sanitizeMediaUrl(videoUrl);
  // The transcribed URL drives the player by default; the video field (once a
  // transcript exists) lets the user swap in an actual video to watch with
  // the same subtitles.
  const playerSrc = trimmedVideoUrl || trimmedUrl;

  const trackUrl = useObjectUrl(result?.chunks?.length ? chunksToVtt(result.chunks) : null, 'text/vtt');
  const srtUrl = useObjectUrl(result?.srt, 'application/x-subrip');

  const activeIndex = useMemo(
    () => result?.chunks.findIndex((c) => currentTime >= c.start && currentTime < c.end) ?? -1,
    [result, currentTime],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmedUrl) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setVideoUrl('');
    setMarked(new Set());
    try {
      setResult(await transcribe(trimmedUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function seek(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    void video.play().catch(() => {});
  }

  function toggleMarked(i: number) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleCopy() {
    if (!result) return;
    const problems = result.chunks
      .map((c, i) => ({ index: i, start: c.start, end: c.end, text: c.text }))
      .filter((c) => marked.has(c.index));
    const jobInfo = {
      url: trimmedUrl,
      jobId: result.jobId,
    };
    const payload = { ...jobInfo, problems };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('הועתק');
    } catch {
      alert('שגיאה בהעתקה');
    }
  }

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>תמלול</h1>
          <p className="muted">הדביקו קישור לקובץ שמע / וידאו — התמלול יוצג לצד הנגן.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="stt-url">קישור</label>
            <input
              id="stt-url"
              type="url"
              className="input"
              dir="ltr"
              placeholder="https://example.com/audio.mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
          </div>

          <BusyButton
            loading={loading}
            disabled={!trimmedUrl}
            busyText={`מתמלל… ${formatElapsed(elapsed)}`}
            note="התמלול עשוי להימשך מספר דקות, אל תסגרו את הדף."
          >
            תמלל
          </BusyButton>
        </form>

        <ErrorAlert error={error} />

        {result && (
          <div className="field">
            <label className="field__label" htmlFor="stt-video-url">קישור לוידאו (להצגה עם כתוביות)</label>
            <input
              id="stt-video-url"
              type="url"
              className="input"
              dir="ltr"
              placeholder="https://example.com/video.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </div>
        )}
      </div>

      {playerSrc && (
        <section className="stt">
          <VideoPlayer
            src={playerSrc}
            trackUrl={trackUrl}
            trackLabel={STT_MODEL}
            videoRef={videoRef}
            onTimeUpdate={setCurrentTime}
          />

          <div className="transcript">
            <div className="transcript__header">
              <span className="transcript__title">{STT_MODEL}</span>
              {loading && <span className="badge badge--run">מעבד…</span>}
              {result && <span className="badge">✓ הושלם</span>}
              {error && <span className="badge badge--error">שגיאה</span>}
              <span className="transcript__actions">
                {marked.size > 0 && (
                  <button type="button" className="btn btn--ghost" onClick={handleCopy}>
                    העתקה ({marked.size})
                  </button>
                )}
                {srtUrl && (
                  <a className="btn btn--ghost" href={srtUrl} download="transcript.srt">
                    הורדת SRT
                  </a>
                )}
              </span>
            </div>
            {loading && <div className="progress" />}
            {!result && !loading && <div className="transcript__empty">—</div>}
            {result && result.chunks.length === 0 && (
              <p className="transcript__text" dir="auto">{result.text || 'לא זוהה דיבור'}</p>
            )}
            {result && result.chunks.length > 0 && (
              <ChunkList
                chunks={result.chunks}
                activeIndex={activeIndex}
                marked={marked}
                onSeek={seek}
                onToggleMark={toggleMarked}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
