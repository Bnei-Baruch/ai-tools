import { useState, type KeyboardEvent } from 'react';
import type { ChunkReview, ErrorCategory } from '../../api/review';
import { diffText } from '../../review/wer';
import { CATEGORIES } from '../review/categories';
import { Words } from '../review/ReviewChunkList';

interface Props {
  // the model's text of the chunk
  original: string;
  edit: ChunkReview | undefined;
  // text to start editing with (a suggestion from the person's transcript); null: not editing
  editing: string | null;
  onStartEdit: () => void;
  onCommit: (corrected: string) => void;
  onCancel: () => void;
  onCategory: (category: ErrorCategory) => void;
  onComment: (comment: string) => void;
  onRevert: () => void;
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

// The mark on one model chunk, as on the review page: the corrected text (a word diff against the
// model's), the error category A/B/C, a comment.
export default function ChunkMark({ original, edit, editing, onStartEdit, onCommit, onCancel, onCategory, onComment, onRevert }: Props) {
  const [text, setText] = useState(editing ?? '');
  const [commentOpen, setCommentOpen] = useState(false);
  const changed = !!edit && edit.corrected !== original;
  const ops = changed ? diffText(original, edit.corrected) : [];

  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(collapse(text));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  const classes = ['compare-mark', changed && !edit.category && 'compare-mark--incomplete'].filter(Boolean).join(' ');

  return (
    <div className={classes} dir="rtl">
      {editing !== null ? (
        <>
          <textarea
            className="input rchunk__input"
            dir="auto"
            rows={2}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={keys}
          />
          <div className="compare-mark__row">
            <button type="button" className="btn btn--primary" onClick={() => onCommit(collapse(text))}>שמירה</button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>ביטול</button>
            <span className="muted">Enter — שמירה, Esc — ביטול</span>
          </div>
        </>
      ) : changed && (
        <div className="compare-mark__text">
          <span dir="auto" className="rchunk__text" title="לחצו לעריכה" onClick={onStartEdit}><Words ops={ops} side="ins" /></span>
          <div className="rchunk__orig" dir="auto"><Words ops={ops} side="del" /></div>
        </div>
      )}

      {changed && editing === null && (
        <div className="rchunk__cats" role="group" aria-label="סוג הטעות">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={edit.category === cat.id ? `rcat rcat--${cat.id} rcat--on` : `rcat rcat--${cat.id}`}
              title={cat.hint}
              onClick={() => onCategory(cat.id)}
            >
              <b>{cat.id}</b> {cat.label}
            </button>
          ))}
          {!edit.category && <span className="rchunk__need">יש לבחור סוג טעות</span>}
        </div>
      )}

      {commentOpen ? (
        <input
          className="input rchunk__comment-input"
          dir="auto"
          autoFocus
          placeholder="הערה"
          value={edit?.comment ?? ''}
          onChange={(e) => onComment(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setCommentOpen(false)}
          onBlur={() => setCommentOpen(false)}
        />
      ) : (
        edit?.comment && <div className="rchunk__comment" dir="auto">💬 {edit.comment}</div>
      )}

      {editing === null && (
        <div className="compare-mark__row">
          {!changed && <button type="button" className="btn btn--ghost" onClick={onStartEdit}>✎ תיקון</button>}
          <button type="button" className="icon-btn" title="הערה" onClick={() => setCommentOpen((o) => !o)}>💬</button>
          {(changed || edit?.comment) && (
            <button type="button" className="icon-btn" title="ביטול הסימון — חזרה לטקסט של המודל" onClick={onRevert}>↺</button>
          )}
        </div>
      )}
    </div>
  );
}
