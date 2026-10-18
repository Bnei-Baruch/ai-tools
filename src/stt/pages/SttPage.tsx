import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { STT_MODEL } from '../config/config';
import { chunksToVtt, formatTimestamp, transcribe, type SttResult } from '../api/transcribe';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SttPage() {
  const [url, setUrl] = useState('https://cdn.kabbalahmedia.info/K8X56H7k');
  const [videoUrl, setVideoUrl] = useState('https://cdn.kabbalahmedia.info/cADzhBzb');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SttResult | null>(null);
  const [subtitles, setSubtitles] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const trimmedUrl = url.trim();
  const trimmedVideoUrl = videoUrl.trim();
  // The transcribed URL drives the player by default; the video field (once a
  // transcript exists) lets the user swap in an actual video to watch with
  // the same subtitles.
  const playerSrc = trimmedVideoUrl || trimmedUrl;

  const trackUrl = useMemo(() => {
    if (!result?.chunks?.length) return null;
    return URL.createObjectURL(new Blob([chunksToVtt(result.chunks)], { type: 'text/vtt' }));
  }, [result]);

  useEffect(() => {
    if (trackUrl) return () => URL.revokeObjectURL(trackUrl);
  }, [trackUrl]);

  const srtUrl = useMemo(() => {
    if (!result?.srt) return null;
    return URL.createObjectURL(new Blob([result.srt], { type: 'application/x-subrip' }));
  }, [result]);

  useEffect(() => {
    if (srtUrl) return () => URL.revokeObjectURL(srtUrl);
  }, [srtUrl]);

  // <track default> is only honored on load, so toggle the text track mode directly.
  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track) track.mode = subtitles ? 'showing' : 'hidden';
  }, [subtitles, trackUrl]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const activeIndex = useMemo(
    () => result?.chunks.findIndex((c) => currentTime >= c.start && currentTime < c.end) ?? -1,
    [result, currentTime],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

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

          <button type="submit" className="btn btn--primary btn--block" disabled={!trimmedUrl || loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden />
                מתמלל… {formatElapsed(elapsed)}
              </>
            ) : (
              'תמלל'
            )}
          </button>
          {loading && <p className="muted center">התמלול עשוי להימשך מספר דקות, אל תסגרו את הדף.</p>}
        </form>

        {error && (
          <div className="alert alert--error" role="alert">
            <strong>שגיאה:</strong> <span dir="auto">{error}</span>
          </div>
        )}

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
          <div className="player">
            <video
              ref={videoRef}
              key={playerSrc + '|' + (trackUrl ?? '')}
              src={playerSrc}
              controls
              crossOrigin="anonymous"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                const track = e.currentTarget.textTracks[0];
                if (track) track.mode = subtitles ? 'showing' : 'hidden';
              }}
            >
              {trackUrl && <track kind="subtitles" label={STT_MODEL} srcLang="he" src={trackUrl} default />}
            </video>
            {trackUrl && (
              <label className="player__toggle">
                <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
                כתוביות
              </label>
            )}
          </div>

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
              <ol className="chunks">
                {result.chunks.map((c, i) => (
                  <li
                    key={i}
                    ref={i === activeIndex ? activeRef : undefined}
                    className={i === activeIndex ? 'chunk chunk--active' : 'chunk'}
                    onClick={() => seek(c.start)}
                  >
                    <input
                      type="checkbox"
                      className="chunk__mark"
                      checked={marked.has(i)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleMarked(i)}
                    />
                    <span className="chunk__ts">{formatTimestamp(c.start)}</span>
                    <span dir="auto">{c.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
    </>
  );
}
