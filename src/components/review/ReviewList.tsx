import type { ReviewResult, ReviewSegment, ReviewSet } from '../../api/review';
import { formatClock, formatMinutes } from './format';

const STATUS: Record<'new' | 'in_progress' | 'done', { label: string; className: string }> = {
  new: { label: 'לא התחיל', className: 'badge badge--muted' },
  in_progress: { label: 'בתהליך', className: 'badge badge--run' },
  done: { label: 'הושלם', className: 'badge' },
};

const segmentStatus = (r: ReviewResult | undefined) => r?.status ?? 'new';
const isReady = (s: ReviewSegment) => !s.status || s.status === 'ready';

// What to suggest: a segment I started, else the one fewest others have finished.
function suggest(set: ReviewSet, results: Record<string, ReviewResult>, othersDone: Record<string, number>): ReviewSegment | undefined {
  const ready = set.segments.filter(isReady);
  const started = ready.find((s) => segmentStatus(results[s.id]) === 'in_progress');
  if (started) return started;
  const fresh = ready.filter((s) => segmentStatus(results[s.id]) === 'new');
  return fresh.sort((a, b) => (othersDone[a.id] ?? 0) - (othersDone[b.id] ?? 0))[0];
}

interface Props {
  set: ReviewSet;
  results: Record<string, ReviewResult>;
  // segment id -> how many other reviewers finished it (helps spread the work)
  othersDone: Record<string, number>;
  userName: string;
  onOpen: (segmentId: string) => void;
  onAdd: () => void;
  onDelete: (segment: ReviewSegment) => void;
  onHelp: () => void;
}

// Reviewers pick their segments themselves from the whole set.
export default function ReviewList({ set, results, othersDone, userName, onOpen, onAdd, onDelete, onHelp }: Props) {
  const seconds = (s: ReviewSegment) => s.end - s.start;
  const done = set.segments.filter((s) => segmentStatus(results[s.id]) === 'done');
  const doneSeconds = done.reduce((sum, s) => sum + seconds(s), 0);
  const next = suggest(set, results, othersDone);

  return (
    <div className="card review-list">
      <header className="card__header review-list__header">
        <div>
          <h1>בדיקת תמלול</h1>
          <p className="muted">{userName}</p>
        </div>
        <button type="button" className="icon-btn review-help-btn" title="הוראות ומקשים" onClick={onHelp}>?</button>
      </header>

      <p className="muted">
        בחרו שיעור מהרשימה — עדיף כזה שעוד לא נבדק או שנבדק פחות — או הוסיפו שיעור מ־kabbalahmedia.info.
      </p>
      <div className="review-progress__text">
        בדקתם {done.length} שיעורים · {formatMinutes(doneSeconds)} שמע
      </div>

      {next && (
        <button type="button" className="btn btn--primary btn--block" onClick={() => onOpen(next.id)}>
          {segmentStatus(results[next.id]) === 'in_progress' ? 'המשך' : 'השיעור הבא'} — {next.title}
        </button>
      )}

      <button type="button" className="btn btn--ghost btn--block" onClick={onAdd}>+ הוספת שיעור</button>

      {set.segments.length === 0 && <p className="transcript__empty">עוד אין שיעורים</p>}
      <ul className="review-segments">
        {set.segments.map((s) => {
          const status = STATUS[segmentStatus(results[s.id])];
          const others = othersDone[s.id] ?? 0;
          return (
            <li key={s.id}>
              <button type="button" className="review-segments__item" disabled={!isReady(s)} onClick={() => onOpen(s.id)}>
                <span className="review-segments__title" dir="auto">
                  {s.title}
                  {s.status === 'failed' && <span className="review-segments__error" dir="auto">התמלול נכשל: {s.error}. אפשר להוסיף את השיעור שוב.</span>}
                </span>
                {isReady(s) && (
                  <span className="review-segments__others" title="כמה בודקים אחרים סיימו את השיעור">
                    {others ? `נבדק ע״י ${others} אחרים` : 'לא נבדק'}
                  </span>
                )}
                <span className="review-segments__duration">{formatClock(seconds(s))}</span>
                {s.status === 'pending' && <span className="badge badge--run">מתמלל…</span>}
                {s.status === 'failed' && <span className="badge badge--error">שגיאה</span>}
                {isReady(s) && <span className={status.className}>{status.label}</span>}
              </button>
              <button type="button" className="icon-btn review-segments__delete" title="מחיקה מהרשימה" onClick={() => onDelete(s)}>
                🗑
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
