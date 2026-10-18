import { ALIGN_URL } from '../config/config';
import { parseSrt, type Chunk } from './transcribe';

export interface Word {
  word: string;
  start: number;
  end: number;
  segment_index: number;
}

export interface AlignResult {
  segments: Chunk[];
  words: Word[];
}

async function errorFrom(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text).detail;
    detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  } catch {
    // not JSON, keep raw text
  }
  return new Error(`${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`);
}

// POST /align/words  multipart: audio=<file>, segments=<JSON [{start,end,text}]>
// The SRT is parsed client-side into the segments the API expects.
export async function alignWords(srt: File, audio: File): Promise<AlignResult> {
  const segments = parseSrt(await srt.text());
  if (segments.length === 0) throw new Error('קובץ ה-SRT ריק או לא תקין');

  const body = new FormData();
  body.append('audio', audio);
  body.append('segments', JSON.stringify(segments));

  const res = await fetch(ALIGN_URL, { method: 'POST', body });
  if (!res.ok) throw await errorFrom(res);
  const { words } = (await res.json()) as { words: Word[] };
  return { segments, words };
}

// "HH:MM:SS,mmm"
function srtTime(s: number): string {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
}

export function chunksToSrt(chunks: Chunk[]): string {
  return chunks.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

// One cue per word.
export function wordsToSrt(words: Word[]): string {
  return chunksToSrt(words.map((w) => ({ start: w.start, end: w.end, text: w.word })));
}

// Original segments, re-timed from their first word's start to their last word's end.
export function segmentsFromWords(segments: Chunk[], words: Word[]): Chunk[] {
  return segments.map((seg, i) => {
    const own = words.filter((w) => w.segment_index === i);
    if (own.length === 0) return seg;
    return { start: own[0].start, end: own[own.length - 1].end, text: seg.text };
  });
}
