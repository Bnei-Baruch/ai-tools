import type { ReactNode } from 'react';

interface Props {
  loading: boolean;
  disabled?: boolean;
  // Shown next to the spinner while loading, e.g. "מעבד… 0:42"
  busyText: string;
  // Shown under the button while loading
  note?: string;
  children: ReactNode;
}

// Full-width submit button; long requests also get a "don't close the page" note.
export default function BusyButton({
  loading,
  disabled,
  busyText,
  note = 'העיבוד עשוי להימשך מספר דקות, אל תסגרו את הדף.',
  children,
}: Props) {
  return (
    <>
      <button type="submit" className="btn btn--primary btn--block" disabled={disabled || loading}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden />
            {busyText}
          </>
        ) : (
          children
        )}
      </button>
      {loading && <p className="muted center">{note}</p>}
    </>
  );
}
