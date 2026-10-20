// A person's transcript of a lesson against the model's (TASK-transcript-compare.md): which words
// differ, and when in the audio each word is.

import type { Chunk } from '../api/transcribe';
import { normalize } from '../review/wer.ts';
import { diffKeys } from './diff.ts';

export interface Word {
  text: string;
  // paragraph of the person's text / chunk of the model's
  group: number;
  // seconds: the model's words are spread over their chunk; the person's words take the time of
  // the model word they match, or of their difference
  time: number;
  // index into Comparison.hunks; -1 where both texts agree
  hunk: number;
}

// A run of words that differ, between two words both texts agree on.
export interface Hunk {
  time: number;
  human: string;
  model: string;
  // the hunk's first word on each side; where a side has no words here (human / model is ''),
  // the word the missing ones would come before
  humanWord: number;
  modelWord: number;
}

export interface Comparison {
  human: Word[];
  model: Word[];
  hunks: Hunk[];
}

// What is compared: a written word -> its normalized words ("בית־הכנסת" -> "בית", "הכנסת");
// punctuation-only words have none and never differ.
interface Unit {
  key: string;
  word: number;
}

function units(words: Word[]): Unit[] {
  return words.flatMap((w, word) => normalize(w.text).split(' ').filter(Boolean).map((key) => ({ key, word })));
}

export function humanWords(text: string): Word[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((p) => p.split(/\s+/).filter(Boolean))
    .filter((p) => p.length > 0)
    .flatMap((p, group) => p.map((text) => ({ text, group, time: 0, hunk: -1 })));
}

// Each chunk's words get times spread over the chunk by their length.
export function modelWords(chunks: Chunk[]): Word[] {
  return chunks.flatMap((c, group) => {
    const parts = c.text.split(/\s+/).filter(Boolean);
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    let before = 0;
    return parts.map((text) => {
      const time = c.start + ((c.end - c.start) * before) / total;
      before += text.length + 1;
      return { text, group, time, hunk: -1 };
    });
  });
}

export function compare(text: string, chunks: Chunk[]): Comparison {
  const human = humanWords(text);
  const model = modelWords(chunks);
  const hu = units(human);
  const mu = units(model);
  const hunks: Hunk[] = [];
  const humanTime = new Array<number | null>(human.length).fill(null);

  let open: Hunk | null = null;
  let openHuman = false;
  let openModel = false;
  let lastTime = 0;
  let lastHuman = -1;
  let lastModel = -1;
  for (const op of diffKeys(hu.map((u) => u.key), mu.map((u) => u.key))) {
    if (op.op === 'same') {
      open = null;
      lastHuman = hu[op.a].word;
      lastModel = mu[op.b].word;
      lastTime = model[lastModel].time;
      humanTime[lastHuman] ??= lastTime;
      continue;
    }
    if (!open) {
      open = { time: lastTime, human: '', model: '', humanWord: lastHuman + 1, modelWord: lastModel + 1 };
      openHuman = false;
      openModel = false;
      hunks.push(open);
    }
    const id = hunks.length - 1;
    if (op.op === 'del') {
      const w = hu[op.a].word;
      if (human[w].hunk < 0) human[w].hunk = id;
      if (!openHuman) open.humanWord = w;
      openHuman = true;
    } else {
      const w = mu[op.b].word;
      if (model[w].hunk < 0) model[w].hunk = id;
      if (!openModel) {
        open.modelWord = w;
        open.time = model[w].time;
      }
      openModel = true;
      lastTime = model[w].time;
    }
  }

  // the person's words in a hunk take its time; punctuation-only words, the time before them
  let time = 0;
  human.forEach((w, i) => {
    time = w.hunk >= 0 ? hunks[w.hunk].time : humanTime[i] ?? time;
    w.time = time;
  });

  const texts = (words: Word[]) => {
    const out = hunks.map(() => [] as string[]);
    words.forEach((w) => w.hunk >= 0 && out[w.hunk].push(w.text));
    return out.map((t) => t.join(' '));
  };
  const humanTexts = texts(human);
  const modelTexts = texts(model);
  hunks.forEach((h, i) => {
    h.human = humanTexts[i];
    h.model = modelTexts[i];
  });

  return { human, model, hunks };
}

// Index of the last word at or before `time` (words are in time order); -1 before the first.
export function wordAt(words: Word[], time: number): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// Marking a hunk as the model's mistake: its chunk (index into the model's chunks) and the chunk's
// text with the person's words in place of the model's. Only that chunk changes, even when the hunk
// runs on into the next one.
export function suggestCorrection(c: Comparison, hunk: number): { chunk: number; text: string } | null {
  const h = c.hunks[hunk];
  if (!h || c.model.length === 0) return null;
  const at = Math.min(h.modelWord, c.model.length - 1);
  const chunk = c.model[at].group;
  const parts: string[] = [];
  let placed = false;
  const place = () => {
    if (!placed && h.human) parts.push(h.human);
    placed = true;
  };
  c.model.forEach((w, i) => {
    if (w.group !== chunk) return;
    if (w.hunk === hunk || (h.model === '' && i === h.modelWord)) place();
    if (w.hunk !== hunk) parts.push(w.text);
  });
  place();
  return { chunk, text: parts.join(' ') };
}
