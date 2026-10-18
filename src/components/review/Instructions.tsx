import { useEffect } from 'react';
import { CATEGORIES } from './categories';

const KEYS: [string, string][] = [
  ['רווח', 'השמעה / עצירה'],
  ['← / →', '3 שניות אחורה / קדימה'],
  ['R', 'השמעת השורה מההתחלה'],
  ['S', 'מהירות רגילה / איטית'],
  ['↑ / ↓', 'השורה הקודמת / הבאה'],
  ['Enter', 'תיקון השורה; בזמן תיקון — שמירה והמשך השמעה'],
  ['Esc', 'ביטול התיקון'],
  ['1 / 2 / 3', 'סוג הטעות A / B / C'],
  ['?', 'ההוראות האלה'],
];

export default function Instructions({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-help-title" onClick={onClose}>
      <div className="review-modal__box" onClick={(e) => e.stopPropagation()}>
        <h2 id="review-help-title">איך בודקים</h2>
        <ol className="review-help">
          <li>
            בוחרים שיעור מהרשימה — עדיף כזה שנבדק פחות. אפשר גם להוסיף שיעור: מדביקים קישור מ־kabbalahmedia.info.
            התמלול לוקח כמה דקות.
          </li>
          <li>מאזינים וקוראים את התמלול שלצד הנגן. כשהכתוב לא תואם את מה שנאמר — מתקנים.</li>
          <li>
            לתיקון לוחצים על הטקסט (או <kbd>Enter</kbd>), מתקנים, ושוב <kbd>Enter</kbd>.
            הנגן נעצר כשמתחילים להקליד וממשיך אחרי <kbd>Enter</kbd>.
          </li>
          <li>
            אחרי כל תיקון בוחרים את סוג הטעות:
            <ul className="review-help__cats">
              {CATEGORIES.map((c) => (
                <li key={c.id}>
                  <span className={`rcat rcat--${c.id} rcat--on`}><b>{c.id}</b> {c.label}</span>
                  {' '}{c.hint}. <span className="muted">לדוגמה: {c.example}.</span>
                </li>
              ))}
            </ul>
          </li>
          <li>דיבור שלא נכתב בכלל — מוסיפים לשורה הקרובה. טקסט שלא נאמר — מוחקים. בשני המקרים: A.</li>
          <li>שורה נכונה — לא נוגעים בה. אפשר להוסיף הערה לכל שורה (💬).</li>
          <li>בסוף הקטע לוחצים „סיימתי“ וחוזרים לרשימה. אפשר לחזור לקטע ולתקן גם אחר כך.</li>
          <li>הכול נשמר מעצמו. אפשר לסגור את הדף ולהמשיך מאותו מקום.</li>
        </ol>

        <h3>מקשים</h3>
        <p className="muted">כשהסמן בתוך שדה טקסט — יחד עם <kbd>Alt</kbd>.</p>
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

        <button type="button" className="btn btn--primary btn--block" autoFocus onClick={onClose}>הבנתי, מתחילים</button>
      </div>
    </div>
  );
}
