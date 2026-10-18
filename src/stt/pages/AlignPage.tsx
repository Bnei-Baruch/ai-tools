import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import FileDrop from '../components/FileDrop';
import { alignWords, chunksToSrt, segmentsFromWords, wordsToSrt, type AlignResult } from '../api/alignWords';
import { formatTimestamp } from '../api/transcribe';

const isSrt = (f: File) => /\.srt$/i.test(f.name) || f.type === 'application/x-subrip';
const isAudio = (f: File) =>
  f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|wav|m4a|ogg|oga|flac|aac|webm|opus|mp4)$/i.test(f.name);

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useObjectUrl(content: string | null, type: string): string | null {
  const url = useMemo(() => (content == null ? null : URL.createObjectURL(new Blob([content], { type }))), [content, type]);
  useEffect(() => {
    if (url) return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export default function AlignPage() {
  const [srt, setSrt] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlignResult | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(() => {
    if (audioUrl) return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const baseName = srt?.name.replace(/\.srt$/i, '') ?? 'aligned';
  const wordsSrtUrl = useObjectUrl(result ? wordsToSrt(result.words) : null, 'application/x-subrip');
  const segmentsSrtUrl = useObjectUrl(
    result ? chunksToSrt(segmentsFromWords(result.segments, result.words)) : null,
    'application/x-subrip',
  );
  const jsonUrl = useObjectUrl(result ? JSON.stringify({ words: result.words }, null, 2) : null, 'application/json');

  // Words grouped under their source segment, keeping the global word index for highlighting.
  const groups = useMemo(() => {
    if (!result) return [];
    const bySegment = result.segments.map(() => [] as { index: number; word: string; start: number }[]);
    result.words.forEach((w, index) => bySegment[w.segment_index]?.push({ index, word: w.word, start: w.start }));
    return result.segments.map((seg, i) => ({ start: seg.start, text: seg.text, words: bySegment[i] }));
  }, [result]);

  const activeIndex = useMemo(
    () => result?.words.findIndex((w) => currentTime >= w.start && currentTime < w.end) ?? -1,
    [result, currentTime],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!srt || !audio) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await alignWords(srt, audio));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function seek(t: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = t;
    void el.play().catch(() => {});
  }

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>תזמון מילים</h1>
          <p className="muted">העלו קובץ SRT וקובץ שמע — יתקבל תזמון לכל מילה וקובץ SRT לפי מילים.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <FileDrop
            label="כתוביות"
            hint="SRT"
            icon="💬"
            accept=".srt,application/x-subrip"
            matches={isSrt}
            file={srt}
            onChange={setSrt}
            disabled={loading}
          />
          <FileDrop
            label="קובץ שמע"
            hint="MP3, WAV, M4A ועוד"
            icon="🎧"
            accept="audio/*,video/*"
            matches={isAudio}
            file={audio}
            onChange={setAudio}
            disabled={loading}
          />

          <button type="submit" className="btn btn--primary btn--block" disabled={!srt || !audio || loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden />
                מעבד… {formatElapsed(elapsed)}
              </>
            ) : (
              'שלח לעיבוד'
            )}
          </button>
          {loading && <p className="muted center">העיבוד עשוי להימשך מספר דקות, אל תסגרו את הדף.</p>}
        </form>

        {error && (
          <div className="alert alert--error" role="alert">
            <strong>שגיאה:</strong> <span dir="auto">{error}</span>
          </div>
        )}
      </div>

      {result && (
        <section className="align">
          {audioUrl && (
            <audio
              ref={audioRef}
              className="align__audio"
              src={audioUrl}
              controls
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          )}

          <div className="transcript">
            <div className="transcript__header">
              <span className="transcript__title">{result.words.length} מילים</span>
              <span className="badge">✓ הושלם</span>
              <span className="transcript__actions">
                {wordsSrtUrl && (
                  <a className="btn btn--primary" href={wordsSrtUrl} download={`${baseName}_words.srt`}>
                    SRT מילים
                  </a>
                )}
                {segmentsSrtUrl && (
                  <a className="btn btn--ghost" href={segmentsSrtUrl} download={`${baseName}_aligned.srt`}>
                    SRT משפטים
                  </a>
                )}
                {jsonUrl && (
                  <a className="btn btn--ghost" href={jsonUrl} download={`${baseName}_words.json`}>
                    JSON
                  </a>
                )}
              </span>
            </div>
            {result.words.length === 0 ? (
              <div className="transcript__empty">לא התקבלו מילים</div>
            ) : (
              <ol className="chunks">
                {groups.map((g, i) => (
                  <li key={i} className="chunk" onClick={() => seek(g.words[0]?.start ?? g.start)}>
                    <span className="chunk__ts">{formatTimestamp(g.words[0]?.start ?? g.start)}</span>
                    <span dir="auto">
                      {g.words.length === 0
                        ? g.text
                        : g.words.map((w) => (
                            <Fragment key={w.index}>
                              <span
                                ref={w.index === activeIndex ? activeRef : undefined}
                                className={w.index === activeIndex ? 'word word--active' : 'word'}
                                title={formatTimestamp(w.start)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  seek(w.start);
                                }}
                              >
                                {w.word}
                              </span>{' '}
                            </Fragment>
                          ))}
                    </span>
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
