// SRT <-> chunks, no browser imports (node tests use it).
import type { Chunk } from './transcribe';

// Parses "HH:MM:SS,mmm" SRT timestamps into seconds.
function srtTimeToSeconds(t: string): number {
  const [h, m, rest] = t.split(':');
  const [s, ms] = rest.split(',');
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseSrt(srt: string): Chunk[] {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const chunks: Chunk[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [start, end] = timeLine.split('-->').map((t) => srtTimeToSeconds(t.trim()));
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (text) chunks.push({ start, end, text });
  }
  return chunks;
}

// "HH:MM:SS,mmm" for SRT
function srtTime(s: number): string {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
}

export function chunksToSrt(chunks: Chunk[]): string {
  return chunks.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
