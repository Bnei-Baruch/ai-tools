import { useEffect, useRef } from 'react';
import { CATEGORIES } from './categories';

const KEYS: [string, string][] = [
  ['רווח', 'השמעה / עצירה'],
  ['← / →', '3 שניות אחורה / קדימה'],
  ['R', 'השורה מההתחלה'],
  ['S', 'מהירות רגילה / איטית'],
  ['↑ / ↓', 'שורה קודמת / הבאה'],
  ['Enter', 'תיקון השורה; בתיקון — שמירה והמשך'],
  ['Esc', 'ביטול התיקון'],
  ['1 / 2 / 3', 'סוג הטעות A / B / C'],
  ['?', 'ההוראות האלה'],
];

export default function Instructions({ onClose }: { onClose: () => void }) {
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // focus the button without scrolling to it: the dialog must open at its top
    startRef.current?.focus({ preventScroll: true });
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-help-title" onClick={onClose}>
      <div className="review-modal__box" onClick={(e) => e.stopPropagation()}>
        <header className="review-modal__header">
          <h2 id="review-help-title">איך בודקים</h2>
          <button type="button" className="icon-btn" title="סגירה (Esc)" onClick={onClose}>✕</button>
        </header>

        <div className="review-modal__body">
          <ol className="review-help">
            <li>
              מוסיפים שיעור: „+ הוספת שיעור“ ומדביקים קישור לשיעור מ־kabbalahmedia.info.
              התמלול לוקח כמה דקות; לא לסגור את הדף עד שיסתיים. השיעור נבדק כולו.
            </li>
            <li>
              מאזינים וקוראים. כשהכתוב לא תואם את מה שנאמר — מתקנים: לוחצים על הטקסט (או <kbd>Enter</kbd>),
              מתקנים, ושוב <kbd>Enter</kbd>. הנגן נעצר כשמתחילים להקליד.
            </li>
            <li>
              לכל תיקון בוחרים סוג טעות:
              <dl className="review-help__cats">
                {CATEGORIES.map((c) => (
                  <div key={c.id}>
                    <dt><span className={`rcat rcat--${c.id} rcat--on`}><b>{c.id}</b> {c.label}</span></dt>
                    <dd>
                      {c.hint}
                      <span className="muted">לדוגמה: {c.example}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
            <li>דיבור שלא נכתב — מוסיפים לשורה הקרובה; טקסט שלא נאמר — מוחקים. בשני המקרים: A.</li>
            <li>שורה נכונה — לא נוגעים בה. הערה לשורה — 💬.</li>
            <li>בסוף השיעור — „סיימתי“. הכול נשמר מעצמו: אפשר לסגור את הדף ולהמשיך מאותו מקום.</li>
          </ol>

          <section className="review-help__keys">
            <h3>מקשים</h3>
            <table className="review-keys">
              <tbody>
                {KEYS.map(([key, action]) => (
                  <tr key={key}>
                    <td><kbd dir="ltr">{key}</kbd></td>
                    <td>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">בתוך שדה טקסט — יחד עם <kbd>Alt</kbd>.</p>
          </section>
        </div>

        <footer className="review-modal__footer">
          <button ref={startRef} type="button" className="btn btn--primary btn--block" onClick={onClose}>הבנתי, מתחילים</button>
        </footer>
      </div>
    </div>
  );
}
