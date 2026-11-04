import { memo, useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import { formatTimestamp } from '../../api/transcribe';
import type { Hunk, Word } from '../../compare/compare';

type Side = 'human' | 'model';

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
}

interface Group {
  from: number;
  to: number;
  // the hunks in this group (they are in order): [first, last], or [-1, -2] for none
  first: number;
  last: number;
}

// One side of the comparison: paragraphs / chunks, the words that differ highlighted, a marker
// where the other side has words this one lacks.
export default function TextColumn({ title, side, words, hunks, activeWord, selected, follow, onSeek, onHunk, marks }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (follow && activeWord >= 0) scrollTo(scrollRef.current, `[data-w="${activeWord}"]`, false);
  }, [follow, activeWord]);

  useEffect(() => {
    if (selected >= 0) scrollTo(scrollRef.current, '.cw--selected', true);
  }, [selected]);

  function handleClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w], [data-gap], [data-ts], [data-mark]');
    if (!el) return;
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
        <span className="muted">{words.length} מילים · {diffs} הבדלים</span>
      </div>
      <div className="compare-col__text" ref={scrollRef} onClick={handleClick}>
        {words.length === 0 && <div className="transcript__empty">—</div>}
        {groups.map((g, i) => (
          <div key={i}>
            <GroupText
              words={words}
              from={g.from}
              to={g.to}
              gaps={gaps}
              last={i === groups.length - 1}
              active={activeWord >= g.from && activeWord < g.to ? activeWord : -1}
              selected={selected >= g.first && selected <= g.last ? selected : -1}
              markable={!!marks}
              mark={marks?.state(words[g.from].group) ?? null}
            />
            {marks?.render(words[g.from].group)}
          </div>
        ))}
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
}

// Memoized: on each timeupdate only the groups with the active word (before and after) re-render.
const GroupText = memo(function GroupText({ words, from, to, gaps, last, active, selected, markable, mark }: GroupProps) {
  const gap = (at: number) =>
    gaps.get(at)?.map((hunk) => (
      <span key={`g${hunk}`} data-gap={hunk} className={hunk === selected ? 'cw-gap cw--selected' : 'cw-gap'} title="חסר כאן">
        ⁁
      </span>
    ));

  const items = [];
  for (let i = from; i < to; i++) {
    const w = words[i];
    const cls = ['cw', w.hunk >= 0 && 'cw--diff', w.hunk >= 0 && w.hunk === selected && 'cw--selected', i === active && 'cw--active']
      .filter(Boolean)
      .join(' ');
    items.push(gap(i), <span key={i} data-w={i} className={cls}>{w.text}</span>, ' ');
  }
  if (last) items.push(gap(to));

  return (
    <p className={mark ? `compare-group compare-group--${mark}` : 'compare-group'}>
      <span className="chunk__ts" data-ts={from}>{formatTimestamp(words[from].time)}</span>
      <span dir="auto" className="compare-group__text">{items}</span>
      {markable && (
        <button type="button" className="icon-btn compare-group__mark" data-mark={words[from].group} title="סימון טעות בשורה">✎</button>
      )}
    </p>
  );
});

// Scrolls the column (not the page) to the first element matching selector.
function scrollTo(container: HTMLElement | null, selector: string, center: boolean) {
  const el = container?.querySelector<HTMLElement>(selector);
  if (!container || !el) return;
  const box = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!center && r.top >= box.top && r.bottom <= box.bottom) return;
  const top = container.scrollTop + r.top - box.top - (center ? box.height / 2 : box.height / 3);
  container.scrollTo({ top, behavior: 'smooth' });
}
