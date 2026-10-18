import { useMemo, useRef, useState, type FormEvent } from 'react';
import { alignWords, chunksToSrt, segmentsFromWords, wordsToSrt, type AlignResult } from '../api/alignWords';
import { formatElapsed } from '../utils';
import useElapsed from '../hooks/useElapsed';
import useObjectUrl from '../hooks/useObjectUrl';
import FileDrop from '../components/stt/FileDrop';
import BusyButton from '../components/stt/BusyButton';
import ErrorAlert from '../components/stt/ErrorAlert';
import AlignedWords from '../components/stt/AlignedWords';

const isSrt = (f: File) => /\.srt$/i.test(f.name) || f.type === 'application/x-subrip';
const isAudio = (f: File) =>
  f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|wav|m4a|ogg|oga|flac|aac|webm|opus|mp4)$/i.test(f.name);

export default function Align() {
  const [srt, setSrt] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlignResult | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const elapsed = useElapsed(loading);

  const audioUrl = useObjectUrl(audio);
  const baseName = srt?.name.replace(/\.srt$/i, '') ?? 'aligned';
  const wordsSrtUrl = useObjectUrl(result ? wordsToSrt(result.words) : null, 'application/x-subrip');
  const segmentsSrtUrl = useObjectUrl(
    result ? chunksToSrt(segmentsFromWords(result.segments, result.words)) : null,
    'application/x-subrip',
  );
  const jsonUrl = useObjectUrl(result ? JSON.stringify({ words: result.words }, null, 2) : null, 'application/json');

  const activeIndex = useMemo(
    () => result?.words.findIndex((w) => currentTime >= w.start && currentTime < w.end) ?? -1,
    [result, currentTime],
  );

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

          <BusyButton loading={loading} disabled={!srt || !audio} busyText={`מעבד… ${formatElapsed(elapsed)}`}>
            שלח לעיבוד
          </BusyButton>
        </form>

        <ErrorAlert error={error} />
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
              <AlignedWords result={result} activeIndex={activeIndex} onSeek={seek} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
