import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { formatTimestamp } from '../../api/transcribe';
import type { Hunk, Word } from '../../compare/compare';

type Side = 'human' | 'model';

// speaker label -> CSS modifier (labels come from ai-trns labels.py)
const SPEAKER_CLASS: Record<string, string> = { 'הרב': 'rav', 'קריין': 'reader', 'תלמיד': 'student' };

export type MarkState = 'marked' | 'incomplete' | null;

// Marking the model's chunks (groups) as on the review page; the group number is the chunk index.
export interface ColumnMarks {
  state: (group: number) => MarkState;
  onMark: (group: number) => void;
  // under the group: its mark / editor, or nothing
  render: (group: number) => ReactNode;
}

interface Props {
  title: string;
  side: Side;
  words: Word[];
  hunks: Hunk[];
  // word under the playhead, -1 for none
  activeWord: number;
  // selected hunk, -1 for none
  selected: number;
  // keep the active word scrolled into view
  follow: boolean;
  onSeek: (time: number) => void;
  onHunk: (hunk: number) => void;
  marks?: ColumnMarks;
  // speaker label of each group (the speakers view), shown before its text
  labels?: (string | null | undefined)[];
  // the reader's groups (label קריין) paler, and folded to their first words until clicked open
  foldReader?: boolean;
  // the group with the active word highlighted
  highlightGroup?: boolean;
  // in the header instead of the word / difference counts, and buttons at its end
  stats?: ReactNode;
  actions?: ReactNode;
  // the person scrolled the text (wheel, touch, keys), e.g. to stop following the audio
  onUserScroll?: () => void;
}

const READER = 'קריין';
// words shown of a folded reader's group
const FOLDED_WORDS = 8;

interface Group {
  from: number;
  to: number;
  // the hunks in this group (they are in order): [first, last], or [-1, -2] for none
  first: number;
  last: number;
}

// One side of the comparison: paragraphs / chunks, the words that differ highlighted, a marker
// where the other side has words this one lacks.
export default function TextColumn({
  title, side, words, hunks, activeWord, selected, follow, onSeek, onHunk, marks, labels,
  foldReader, highlightGroup, stats, actions, onUserScroll,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // the reader's groups opened (by their first word)
  const [opened, setOpened] = useState<Set<number>>(new Set());

  // word index -> hunks whose words are missing on this side right before it
  const gaps = useMemo(() => {
    const out = new Map<number, number[]>();
    hunks.forEach((h, i) => {
      if (h[side] !== '') return;
      const at = side === 'human' ? h.humanWord : h.modelWord;
      out.set(at, [...(out.get(at) ?? []), i]);
    });
    return out;
  }, [hunks, side]);

  const groups = useMemo(() => {
    const out: Group[] = [];
    const add = (g: Group, hunk: number) => {
      g.first = g.first < 0 ? hunk : Math.min(g.first, hunk);
      g.last = Math.max(g.last, hunk);
    };
    words.forEach((w, i) => {
      let g = out[out.length - 1];
      if (g && words[g.from].group === w.group) g.to = i + 1;
      else out.push((g = { from: i, to: i + 1, first: -1, last: -2 }));
      if (w.hunk >= 0) add(g, w.hunk);
      gaps.get(i)?.forEach((hunk) => add(g, hunk));
    });
    if (out.length) gaps.get(words.length)?.forEach((hunk) => add(out[out.length - 1], hunk));
    return out;
  }, [words, gaps]);

  useEffect(() => {
    if (follow && activeWord >= 0 && !scrollTo(scrollRef.current, `[data-w="${activeWord}"]`, false)) {
      scrollTo(scrollRef.current, '.compare-group--current', false);
    }
  }, [follow, activeWord]);

  useEffect(() => {
    if (selected >= 0) scrollTo(scrollRef.current, '.cw--selected', true);
  }, [selected]);

  function handleClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w], [data-gap], [data-ts], [data-mark], [data-fold]');
    if (!el) return;
    if (el.dataset.fold) {
      const from = Number(el.dataset.fold);
      return setOpened((prev) => {
        const next = new Set(prev);
        if (next.has(from)) next.delete(from);
        else next.add(from);
        return next;
      });
    }
    if (el.dataset.mark) return marks?.onMark(Number(el.dataset.mark));
    if (el.dataset.gap) return onHunk(Number(el.dataset.gap));
    const w = words[Number(el.dataset.w ?? el.dataset.ts)];
    if (el.dataset.w && w.hunk >= 0) onHunk(w.hunk);
    else onSeek(w.time);
  }

  const diffs = useMemo(() => hunks.filter((h) => h[side] !== '').length, [hunks, side]);

  return (
    <div className={`transcript compare-col compare-col--${side}`}>
      <div className="transcript__header">
        <span className="transcript__title">{title}</span>
        <span className="muted">{stats ?? `${words.length} מילים · ${diffs} הבדלים`}</span>
        {actions && <span className="transcript__actions">{actions}</span>}
      </div>
      <div
        className="compare-col__text"
        ref={scrollRef}
        onClick={handleClick}
        onWheel={onUserScroll}
        onTouchMove={onUserScroll}
        onKeyDown={(e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) && onUserScroll?.()}
      >
        {words.length === 0 && <div className="transcript__empty">—</div>}
        {groups.map((g, i) => {
          const label = labels?.[words[g.from].group] ?? null;
          const reader = !!foldReader && label === READER;
          const current = activeWord >= g.from && activeWord < g.to;
          return (
          <div key={i}>
            <GroupText
              words={words}
              from={g.from}
              to={g.to}
              gaps={gaps}
              last={i === groups.length - 1}
              active={current ? activeWord : -1}
              current={!!highlightGroup && current}
              reader={reader}
              folded={reader && !opened.has(g.from) && g.to - g.from > FOLDED_WORDS}
              selected={selected >= g.first && selected <= g.last ? selected : -1}
              markable={!!marks}
              mark={marks?.state(words[g.from].group) ?? null}
              label={label}
            />
            {marks?.render(words[g.from].group)}
          </div>
          );
        })}
      </div>
    </div>
  );
}

interface GroupProps {
  words: Word[];
  from: number;
  to: number;
  gaps: Map<number, number[]>;
  // the last group also shows the gaps after the last word
  last: boolean;
  active: number;
  selected: number;
  // the group can be marked (the model's side, against בדיקת תמלול), and its mark
  markable: boolean;
  mark: MarkState;
  label: string | null;
  // the group with the active word (highlightGroup)
  current?: boolean;
  // the reader's (foldReader), and folded to its first words
  reader?: boolean;
  folded?: boolean;
}

// Memoized: on each timeupdate only the groups with the active word (before and after) re-render.
const GroupText = memo(function GroupText({
  words, from, to, gaps, last, active, selected, markable, mark, label, current, reader, folded,
}: GroupProps) {
  const gap = (at: number) =>
    gaps.get(at)?.map((hunk) => (
      <span key={`g${hunk}`} data-gap={hunk} className={hunk === selected ? 'cw-gap cw--selected' : 'cw-gap'} title="חסר כאן">
        ⁁
      </span>
    ));

  const items = [];
  const shown = folded ? Math.min(to, from + FOLDED_WORDS) : to;
  for (let i = from; i < shown; i++) {
    const w = words[i];
    const cls = ['cw', w.hunk >= 0 && 'cw--diff', w.hunk >= 0 && w.hunk === selected && 'cw--selected', i === active && 'cw--active']
      .filter(Boolean)
      .join(' ');
    items.push(gap(i), <span key={i} data-w={i} className={cls}>{w.text}</span>, ' ');
  }
  if (last && !folded) items.push(gap(to));
  if (reader && to - from > FOLDED_WORDS) {
    items.push(
      <button key="fold" type="button" className="compare-group__fold" data-fold={from}>
        {folded ? `… עוד ${to - shown} מילים` : 'קיפול'}
      </button>,
    );
  }

  const cls = ['compare-group', mark && `compare-group--${mark}`, current && 'compare-group--current', reader && 'compare-group--reader']
    .filter(Boolean)
    .join(' ');
  return (
    <p className={cls}>
      <span className="chunk__ts" data-ts={from}>{formatTimestamp(words[from].time)}</span>
      <span dir="auto" className="compare-group__text">
        {label && <strong className={`compare-group__speaker compare-group__speaker--${SPEAKER_CLASS[label] ?? 'other'}`}><u>{label}</u>: </strong>}
        {items}
      </span>
      {markable && (
        <button type="button" className="icon-btn compare-group__mark" data-mark={words[from].group} title="סימון טעות בשורה">✎</button>
      )}
    </p>
  );
});

// Scrolls the column (not the page) to the first element matching selector; false if there is none.
function scrollTo(container: HTMLElement | null, selector: string, center: boolean): boolean {
  const el = container?.querySelector<HTMLElement>(selector);
  if (!container || !el) return false;
  const box = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!center && r.top >= box.top && r.bottom <= box.bottom) return true;
  const top = container.scrollTop + r.top - box.top - (center ? box.height / 2 : box.height / 3);
  container.scrollTo({ top, behavior: 'smooth' });
  return true;
}
