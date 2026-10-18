import { useState, type FormEvent } from 'react';
import { docdiffCompare, MAX_UPLOAD_SIZE } from '../api/stt';
import { formatElapsed, saveBlob } from '../utils';
import useElapsed from '../hooks/useElapsed';
import FileDrop from '../components/stt/FileDrop';
import BusyButton from '../components/stt/BusyButton';
import ErrorAlert from '../components/stt/ErrorAlert';
import DocxPreview from '../components/stt/DocxPreview';

interface DocdiffResult {
  blob: Blob;
  fileName: string;
  stats: Record<string, number>;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === DOCX_MIME;
const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|oga|flac|aac|webm|opus)$/i.test(f.name);

export default function DocDiff() {
  const [doc, setDoc] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [upload, setUpload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocdiffResult | null>(null);
  const elapsed = useElapsed(loading);

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

          <BusyButton
            loading={loading}
            disabled={!doc || !audio}
            busyText={upload < 100 ? `מעלה… ${upload}%` : `מעבד… ${formatElapsed(elapsed)}`}
          >
            שלח לעיבוד
          </BusyButton>
        </form>

        <ErrorAlert error={error} />
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

          <DocxPreview blob={result.blob} />
        </section>
      )}
    </>
  );
}
