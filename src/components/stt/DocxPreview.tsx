import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

// Renders a .docx blob as pages and scrolls to it once rendered.
export default function DocxPreview({ blob }: { blob: Blob }) {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container.innerHTML = '';
    setRendering(true);
    setError(null);
    renderAsync(blob, container, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    })
      .then(() => {
        if (!cancelled) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <>
      {rendering && (
        <div className="preview__status">
          <span className="spinner spinner--dark" aria-hidden /> טוען תצוגה מקדימה…
        </div>
      )}
      {error && (
        <div className="alert alert--warn">
          לא ניתן להציג תצוגה מקדימה ({error}). הקובץ עצמו נשמר ואפשר לפתוח אותו ב-Word.
        </div>
      )}
      <div className="preview__pages" ref={containerRef} />
    </>
  );
}
