import { useState, type FormEvent } from 'react';
import { fetchUnit, parseUnitUid, pickFiles, type ContentUnit, type KmediaFile } from '../../api/kmedia';
import { addSegment, type ReviewSegment, type ReviewSet } from '../../api/review';
import ErrorAlert from '../stt/ErrorAlert';
import type { Reviewer } from './SegmentReview';
import { formatClock } from './format';

interface Props {
  set: ReviewSet;
  reviewer: Reviewer;
  onAdded: (segment: ReviewSegment) => void;
  onCancel: () => void;
}

// A lesson link from kabbalahmedia.info -> the server transcribes the whole lesson -> it joins the shared list.
export default function AddSegment({ set, reviewer, onAdded, onCancel }: Props) {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<ContentUnit | null>(null);
  const [files, setFiles] = useState<{ audio: KmediaFile; video?: KmediaFile } | null>(null);
  const [title, setTitle] = useState('');

  // a lesson whose transcription failed can be added again: that is how it is retried
  const existing = unit && set.segments.find((s) => (s.unit_uid === unit.id || s.id === unit.id) && s.status !== 'failed');
  const duration = unit?.duration ?? files?.audio.duration ?? 0;

  async function load(e: FormEvent) {
    e.preventDefault();
    const uid = parseUnitUid(link);
    if (!uid) {
      setError('לא זוהה שיעור בקישור. דוגמה: https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo');
      return;
    }
    setLoading(true);
    setError(null);
    setUnit(null);
    try {
      const loaded = await fetchUnit(uid);
      const { audio, video } = pickFiles(loaded);
      if (!audio) throw new Error('לשיעור אין קובץ שמע בשפת המקור');
      setUnit(loaded);
      setFiles({ audio, video });
      setTitle([loaded.name, loaded.film_date].filter(Boolean).join(' · '));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!unit || !files || existing) return;
    setLoading(true);
    setError(null);
    try {
      onAdded(await addSegment(set.id, {
        unit_uid: unit.id,
        title: title.trim() || unit.name,
        audio_file_id: files.audio.id,
        video_file_id: files.video?.id,
        duration,
        reviewer: reviewer.id,
        reviewer_name: reviewer.name,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="card review-add">
      <header className="card__header review-list__header">
        <div>
          <h1>שיעור חדש</h1>
          <p className="muted">קישור לשיעור מ־kabbalahmedia.info. השיעור נבדק כולו.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>→ לרשימה</button>
      </header>

      <form onSubmit={load} className="review-add__link">
        <input
          type="url"
          className="input"
          dir="ltr"
          placeholder="https://kabbalahmedia.info/he/lessons/cu/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button type="submit" className="btn btn--ghost" disabled={loading || !link.trim()}>טעינה</button>
      </form>
      <ErrorAlert error={error} />

      {unit && files && (
        <form onSubmit={submit} className="review-add__form">
          <p className="muted">
            אורך: {formatClock(duration)} · {files.video ? 'וידאו ושמע' : 'שמע בלבד'}
          </p>

          <div className="field">
            <label className="field__label" htmlFor="review-title">שם</label>
            <input id="review-title" className="input" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {existing && <div className="alert alert--warn">השיעור כבר ברשימה: {existing.title}</div>}

          <button type="submit" className="btn btn--primary btn--block" disabled={loading || !!existing}>
            הוספה לרשימה ותמלול
          </button>
          <p className="muted center">התמלול נעשה בשרת ולוקח כמה דקות; בינתיים אפשר לבדוק שיעורים אחרים.</p>
        </form>
      )}
    </div>
  );
}
