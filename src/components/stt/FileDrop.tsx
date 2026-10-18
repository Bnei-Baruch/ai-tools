import { useRef, useState, type DragEvent } from 'react';

interface Props {
  label: string;
  hint: string;
  icon: string;
  accept: string;
  matches: (file: File) => boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  // Bytes; a bigger file is accepted but flagged.
  warnSize?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileDrop({ label, hint, icon, accept, matches, file, onChange, disabled, warnSize }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!matches(f)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onChange(f);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) pick(e.dataTransfer.files[0]);
  }

  function clear() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const classes = ['drop', dragOver && 'drop--over', file && 'drop--filled', rejected && 'drop--rejected', disabled && 'drop--disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div
        className={classes}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="drop__icon" aria-hidden>{icon}</span>
        {file ? (
          <span className="drop__text">
            <span className="drop__name" dir="auto">{file.name}</span>
            <span className="drop__meta">
              {formatSize(file.size)}
              {warnSize && file.size > warnSize && (
                <span className="drop__warn"> · מעל {formatSize(warnSize)}, השרת עלול לדחות את הקובץ</span>
              )}
            </span>
          </span>
        ) : (
          <span className="drop__text">
            <span className="drop__name">גררו קובץ לכאן או לחצו לבחירה</span>
            <span className="drop__meta">{rejected ? 'סוג קובץ לא נתמך' : hint}</span>
          </span>
        )}
        {file && !disabled && (
          <button
            type="button"
            className="icon-btn"
            aria-label="הסר קובץ"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
          >
            ✕
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
