import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { formatTimestamp, type Chunk } from '../../api/transcribe';
import type { ChunkReview, ErrorCategory } from '../../api/review';
import { diffText, type DiffOp } from '../../review/wer';
import { CATEGORIES } from './categories';

interface Props {
  chunks: Chunk[];
  // segment start: times are shown relative to it
  offset: number;
  edits: Record<number, ChunkReview>;
  // the line being edited and its text so far
  editing: { index: number; text: string } | null;
  // keyboard focus; follows the playhead
  selected: number;
  // line under the playhead, -1 for none
  active: number;
  commentOpen: number | null;
  onSeek: (index: number) => void;
  onSelect: (index: number) => void;
  onStartEdit: (index: number) => void;
  onEditText: (text: string) => void;
  // resume: Enter continues playback, blur doesn't
  onCommit: (resume: boolean) => void;
  onCancel: () => void;
  onCategory: (index: number, category: ErrorCategory) => void;
  onRevert: (index: number) => void;
  onToggleComment: (index: number) => void;
  onCloseComment: () => void;
  onComment: (index: number, comment: string) => void;
}

// Buttons shouldn't take focus: Space must keep toggling the player, not re-click the button.
const keepFocus = (e: MouseEvent) => e.preventDefault();

function Words({ ops, side }: { ops: DiffOp[]; side: 'ins' | 'del' }) {
  const shown = ops.filter((o) => o.op === 'same' || o.op === side);
  if (!shown.length) return <span className="rchunk__empty">(נמחק)</span>;
  return (
    <>
      {shown.map((o, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {o.op === 'same' ? o.word : <mark className={`rchunk__${side}`}>{o.word}</mark>}
        </span>
      ))}
    </>
  );
}

export default function ReviewChunkList(props: Props) {
  const { chunks, offset, edits, editing, selected, active, commentOpen } = props;
  const selectedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  function editKeys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.altKey) return; // Alt+key: player shortcuts, handled by the page
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      props.onCommit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancel();
    }
  }

  return (
    <ol className="chunks rchunks">
      {chunks.map((c, i) => {
        const edit = edits[i];
        const changed = !!edit && edit.corrected !== c.text;
        const ops = changed ? diffText(c.text, edit.corrected) : [];
        const isEditing = editing?.index === i;
        const className = [
          'rchunk',
          i === active && 'chunk--active',
          i === selected && 'rchunk--selected',
          changed && 'rchunk--changed',
          changed && !edit.category && 'rchunk--incomplete',
        ].filter(Boolean).join(' ');

        return (
          <li key={i} ref={i === selected ? selectedRef : undefined} className={className} onClick={() => props.onSelect(i)}>
            <button type="button" className="chunk__ts rchunk__ts" title="השמעה מכאן" onMouseDown={keepFocus} onClick={() => props.onSeek(i)}>
              {formatTimestamp(c.start - offset)}
            </button>

            <div className="rchunk__body">
              {isEditing ? (
                <textarea
                  className="input rchunk__input"
                  dir="auto"
                  rows={2}
                  autoFocus
                  value={editing.text}
                  onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                  onChange={(e) => props.onEditText(e.target.value)}
                  onKeyDown={editKeys}
                  onBlur={() => props.onCommit(false)}
                />
              ) : (
                <span className="rchunk__text" dir="auto" title="לחצו לתיקון" onClick={() => props.onStartEdit(i)}>
                  {changed ? <Words ops={ops} side="ins" /> : c.text}
                </span>
              )}

              {changed && !isEditing && (
                <div className="rchunk__orig" dir="auto"><Words ops={ops} side="del" /></div>
              )}

              {changed && (
                <div className="rchunk__cats" role="group" aria-label="סוג הטעות">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={edit.category === cat.id ? `rcat rcat--${cat.id} rcat--on` : `rcat rcat--${cat.id}`}
                      title={`${cat.hint} (${cat.key})`}
                      onMouseDown={keepFocus}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onCategory(i, cat.id);
                      }}
                    >
                      <b>{cat.id}</b> {cat.label}
                    </button>
                  ))}
                  {!edit.category && <span className="rchunk__need">יש לבחור סוג טעות</span>}
                </div>
              )}

              {commentOpen === i ? (
                <input
                  className="input rchunk__comment-input"
                  dir="auto"
                  autoFocus
                  placeholder="הערה"
                  value={edit?.comment ?? ''}
                  onChange={(e) => props.onComment(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.altKey) return;
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault();
                      props.onCloseComment();
                    }
                  }}
                  onBlur={props.onCloseComment}
                />
              ) : (
                edit?.comment && <div className="rchunk__comment" dir="auto">💬 {edit.comment}</div>
              )}
            </div>

            <div className="rchunk__tools">
              <button
                type="button"
                className={edit?.comment ? 'icon-btn icon-btn--on' : 'icon-btn'}
                title="הערה"
                onMouseDown={keepFocus}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleComment(i);
                }}
              >
                💬
              </button>
              {changed && (
                <button
                  type="button"
                  className="icon-btn"
                  title="ביטול התיקון — חזרה לטקסט המקורי"
                  onMouseDown={keepFocus}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRevert(i);
                  }}
                >
                  ↺
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
