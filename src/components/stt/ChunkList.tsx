import { useEffect, useRef } from 'react';
import { formatTimestamp, type Chunk } from '../../api/transcribe';

interface Props {
  chunks: Chunk[];
  // Chunk under the playhead, kept scrolled into view; -1 for none
  activeIndex: number;
  marked: Set<number>;
  onSeek: (time: number) => void;
  onToggleMark: (index: number) => void;
}

export default function ChunkList({ chunks, activeIndex, marked, onSeek, onToggleMark }: Props) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <ol className="chunks">
      {chunks.map((c, i) => (
        <li
          key={i}
          ref={i === activeIndex ? activeRef : undefined}
          className={i === activeIndex ? 'chunk chunk--active' : 'chunk'}
          onClick={() => onSeek(c.start)}
        >
          <input
            type="checkbox"
            className="chunk__mark"
            checked={marked.has(i)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleMark(i)}
          />
          <span className="chunk__ts">{formatTimestamp(c.start)}</span>
          <span dir="auto">{c.text}</span>
        </li>
      ))}
    </ol>
  );
}
