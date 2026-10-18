import { Fragment, useEffect, useMemo, useRef } from 'react';
import { formatTimestamp } from '../../api/transcribe';
import type { AlignResult } from '../../api/alignWords';

interface Props {
  result: AlignResult;
  // Index into result.words of the word under the playhead; -1 for none
  activeIndex: number;
  onSeek: (time: number) => void;
}

export default function AlignedWords({ result, activeIndex, onSeek }: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);

  // Words grouped under their source segment, keeping the global word index for highlighting.
  const groups = useMemo(() => {
    const bySegment = result.segments.map(() => [] as { index: number; word: string; start: number }[]);
    result.words.forEach((w, index) => bySegment[w.segment_index]?.push({ index, word: w.word, start: w.start }));
    return result.segments.map((seg, i) => ({ start: seg.start, text: seg.text, words: bySegment[i] }));
  }, [result]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <ol className="chunks">
      {groups.map((g, i) => (
        <li key={i} className="chunk" onClick={() => onSeek(g.words[0]?.start ?? g.start)}>
          <span className="chunk__ts">{formatTimestamp(g.words[0]?.start ?? g.start)}</span>
          <span dir="auto">
            {g.words.length === 0
              ? g.text
              : g.words.map((w) => (
                  <Fragment key={w.index}>
                    <span
                      ref={w.index === activeIndex ? activeRef : undefined}
                      className={w.index === activeIndex ? 'word word--active' : 'word'}
                      title={formatTimestamp(w.start)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(w.start);
                      }}
                    >
                      {w.word}
                    </span>{' '}
                  </Fragment>
                ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
