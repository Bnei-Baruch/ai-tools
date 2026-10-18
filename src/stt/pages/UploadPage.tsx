import { useEffect, useRef, useState, type FormEvent } from 'react';
import { renderAsync } from 'docx-preview';
import FileDrop from '../components/FileDrop';
import { docdiffCompare, MAX_UPLOAD_SIZE } from '../../AITools/stt';
import { saveBlob } from '../../AITools/tools';

interface DocdiffResult {
  blob: Blob;
  fileName: string;
  stats: Record<string, number>;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === DOCX_MIME;
const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|oga|flac|aac|webm|opus)$/i.test(f.name);

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function UploadPage() {
  const [doc, setDoc] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [upload, setUpload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocdiffResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    const container = previewRef.current;
    if (!result || !container) return;
    let cancelled = false;
    container.innerHTML = '';
    setRendering(true);
    setPreviewError(null);
    renderAsync(result.blob, container, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    })
      .then(() => {
        if (!cancelled) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch((err) => !cancelled && setPreviewError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
    };
  }, [result]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!doc || !audio) return;
    setLoading(true);
    setUpload(0);
    setError(null);
    setResult(null);
    try {
      const res: DocdiffResult = await docdiffCompare(doc, audio, { onUploadProgress: setUpload });
      saveBlob(res.blob, res.fileName);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDoc(null);
    setAudio(null);
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <div className="card">
        <header className="card__header">
          <h1>עיבוד קובץ</h1>
          <p className="muted">העלו מסמך וקובץ שמע — המסמך המסומן יורד אוטומטית ויוצג למטה.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <FileDrop
            label="מסמך"
            hint="DOCX"
            icon="📄"
            accept={`.docx,${DOCX_MIME}`}
            matches={isDocx}
            file={doc}
            onChange={setDoc}
            disabled={loading}
            warnSize={MAX_UPLOAD_SIZE}
          />
          <FileDrop
            label="קובץ שמע"
            hint="MP3, WAV, M4A ועוד"
            icon="🎧"
            accept="audio/*"
            matches={isAudio}
            file={audio}
            onChange={setAudio}
            disabled={loading}
            warnSize={MAX_UPLOAD_SIZE}
          />

          <button type="submit" className="btn btn--primary btn--block" disabled={!doc || !audio || loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden />
                {upload < 100 ? `מעלה… ${upload}%` : `מעבד… ${formatElapsed(elapsed)}`}
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
        <section className="preview">
          <div className="preview__bar">
            <div className="preview__title">
              <span className="badge">✓ הושלם</span>
              <span className="preview__name" dir="auto">{result.fileName}</span>
              <span className="muted">
                מילים במסמך: {result.stats.text_words} · מילים בשמע: {result.stats.audio_words} · סומנו:{' '}
                {result.stats.removed_marked}/{result.stats.removed_total}
              </span>
            </div>
            <div className="preview__actions">
              <button type="button" className="btn btn--primary" onClick={() => saveBlob(result.blob, result.fileName)}>
                הורד שוב
              </button>
              <button type="button" className="btn btn--ghost" onClick={reset}>
                קובץ חדש
              </button>
            </div>
          </div>

          {rendering && (
            <div className="preview__status">
              <span className="spinner spinner--dark" aria-hidden /> טוען תצוגה מקדימה…
            </div>
          )}
          {previewError && (
            <div className="alert alert--warn">
              לא ניתן להציג תצוגה מקדימה ({previewError}). הקובץ עצמו נשמר ואפשר לפתוח אותו ב-Word.
            </div>
          )}
          <div className="preview__pages" ref={previewRef} />
        </section>
      )}
    </>
  );
}
