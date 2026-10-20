import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAllResults, type AllResults } from '../../api/review';
import { byCategory, disagreements, modelOf, progress, rows, summarize, toCsv, type Summary } from '../../review/report';
import { saveBlob } from '../../utils';
import ErrorAlert from '../stt/ErrorAlert';
import { formatClock } from './format';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => x.toFixed(1);

function SummaryRow({ label, s }: { label: string; s: Summary }) {
  return (
    <tr>
      <th dir="auto">{label}</th>
      <td>{s.segments}</td>
      <td>{num(s.minutes)}</td>
      <td className="review-report__main">{num(s.aPer10)}</td>
      <td>{num(s.bPer10)}</td>
      <td>{num(s.cPer10)}</td>
      <td>{pct(s.noA)}</td>
      <td>{pct(s.wer)}</td>
      <td>{s.baselineWer == null ? '—' : pct(s.baselineWer)}</td>
      <td>{Math.round(s.editSecPerMin)}</td>
    </tr>
  );
}

// Admin report, by link (login required by the API): /review/{set_id}/results
export default function ReviewReport() {
  const { setId = '' } = useParams();
  const [data, setData] = useState<AllResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllResults(setId).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [setId]);

  const report = useMemo(() => {
    if (!data) return null;
    const rs = rows(data.set, data.results);
    return {
      rows: rs,
      total: summarize(rs),
      categories: byCategory(data.set, rs),
      disagreements: disagreements(rs),
      progress: progress(data.set, data.results),
      // models of the finished lessons; the metrics mix them if there is more than one
      models: [...new Set(rs.map((r) => modelOf(data.set, r.segment, r.result)))],
    };
  }, [data]);

  if (error) return <div className="card"><ErrorAlert error={error} /></div>;
  if (!data || !report) return <div className="card"><div className="progress" /></div>;
  const { set } = data;
  const hasBaseline = set.segments.some((s) => s.baseline_chunks);

  return (
    <div className="review-report">
      <div className="card review-report__card">
        <header className="card__header review-list__header">
          <div>
            <h1>תוצאות בדיקת תמלול</h1>
            <p className="muted" dir="ltr">
              model: <b>{report.models.join(', ') || set.model}</b>{set.baseline_model && <> · baseline: {set.baseline_model}</>}
            </p>
          </div>
          <span className="transcript__actions">
            <button type="button" className="btn btn--ghost"
              onClick={() => saveBlob(new Blob([toCsv(set, report.rows)], { type: 'text/csv' }), `${set.id}.csv`)}>
              CSV
            </button>
            <button type="button" className="btn btn--ghost"
              onClick={() => saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${set.id}.json`)}>
              JSON
            </button>
          </span>
        </header>
        {report.models.length > 1 && (
          <div className="alert alert--warn">
            השיעורים תומללו בכמה מודלים: <span dir="ltr">{report.models.join(', ')}</span>. הסיכום מערבב אותם; לפילוח — CSV, עמודת model.
          </div>
        )}

        <h2>התקדמות</h2>
        <table className="review-table">
          <thead><tr><th>בודק</th><th>הושלמו</th><th>דקות שמע</th><th>בתהליך</th><th>דקות עבודה</th></tr></thead>
          <tbody>
            {report.progress.map((p) => (
              <tr key={p.reviewer}>
                <th dir="auto" title={p.reviewer}>{p.name || <code dir="ltr">{p.reviewer}</code>}</th>
                <td>{p.done}</td><td>{num(p.doneMinutes)}</td><td>{p.inProgress}</td><td>{Math.round(p.activeMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>סיכום</h2>
        <p className="muted">רק קטעים שהושלמו. המדד העיקרי: טעויות A ל־10 דקות שמע.</p>
        <table className="review-table">
          <thead>
            <tr>
              <th>סוג קטע</th><th>קטעים</th><th>דקות</th><th>A / 10 דק׳</th><th>B / 10 דק׳</th><th>C / 10 דק׳</th>
              <th>ללא A</th><th>WER</th><th>WER בסיס</th><th>שניות עבודה לדקה</th>
            </tr>
          </thead>
          <tbody>
            <SummaryRow label="הכול" s={report.total} />
            {report.categories.map(([cat, s]) => <SummaryRow key={cat} label={cat} s={s} />)}
          </tbody>
        </table>
        {hasBaseline && (
          <p className="muted review-report__note">
            WER בסיס: המודל {set.baseline_model} מול אותו טקסט מתוקן. הטקסט המתוקן נוצר מתיקון התמלול של המודל שלנו,
            ולכן ההשוואה מעט לטובתו.
          </p>
        )}

        <h2>לפי קטע</h2>
        <table className="review-table">
          <thead>
            <tr><th>קטע</th><th>סוג</th><th>אורך</th><th>בודק</th><th>A</th><th>B</th><th>C</th><th>WER</th><th>WER בסיס</th><th>זמן עבודה</th></tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={`${r.segment.id}/${r.result.reviewer}`}>
                <th dir="auto">{r.segment.title}</th>
                <td>{r.segment.category ?? '—'}</td>
                <td>{formatClock(r.minutes * 60)}</td>
                <td dir="auto">{r.result.reviewer_name || r.result.reviewer}</td>
                <td className="review-report__main">{r.a}</td><td>{r.b}</td><td>{r.c}</td>
                <td>{pct(r.wer.words ? r.wer.errors / r.wer.words : 0)}</td>
                <td>{r.baselineWer ? pct(r.baselineWer.words ? r.baselineWer.errors / r.baselineWer.words : 0) : '—'}</td>
                <td>{formatClock(r.result.active_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {report.disagreements.length > 0 && (
          <>
            <h2>הבדלים בין בודקים</h2>
            <p className="muted">שורות שתוקנו על ידי חלק מהבודקים בלבד.</p>
            <table className="review-table">
              <thead><tr><th>קטע</th><th>בודקים</th><th>שורות</th></tr></thead>
              <tbody>
                {report.disagreements.map((d) => (
                  <tr key={d.segment.id}>
                    <th dir="auto">{d.segment.title}</th>
                    <td dir="auto">{d.reviewers.join(', ')}</td>
                    <td>{d.chunks} מתוך {d.segment.chunks.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
