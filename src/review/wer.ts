// Hebrew text normalization, word diff and WER for the STT review.

// Niqqud and cantillation marks (letters U+05D0-U+05EA are outside this range).
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;
// Joiners between words: hyphen, dashes, maqaf, slash.
const WORD_JOINERS = /[-‐-―־/]/g;
// Everything else that isn't a letter, a digit or whitespace: punctuation, quotes,
// geresh/gershayim, paseq, sof pasuq.
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

// For WER only: what a reviewer can't hear (niqqud, punctuation, quotes) doesn't count.
// Final letters are kept as they are -- a wrong final letter is a spelling error.
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(WORD_JOINERS, ' ')
    .replace(NON_WORD, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const words = (text: string): string[] => normalize(text).split(' ').filter(Boolean);

export type DiffOp = { op: 'same' | 'del' | 'ins'; word: string };

// Word-level diff of a -> b (LCS), on the words as written; compare normalizes both sides.
export function diffWords(a: string[], b: string[], compare: (w: string) => string = (w) => w): DiffOp[] {
  const ka = a.map(compare);
  const kb = b.map(compare);
  // lcs[i][j]: LCS length of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      ops.push({ op: 'same', word: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ op: 'del', word: a[i++] });
    } else {
      ops.push({ op: 'ins', word: b[j++] });
    }
  }
  while (i < a.length) ops.push({ op: 'del', word: a[i++] });
  while (j < b.length) ops.push({ op: 'ins', word: b[j++] });
  return ops;
}

// Display diff: splits on whitespace, ignores niqqud/punctuation when matching words.
export const diffText = (from: string, to: string): DiffOp[] =>
  diffWords(from.split(/\s+/).filter(Boolean), to.split(/\s+/).filter(Boolean), normalize);

// Word edit distance (substitutions + deletions + insertions).
export function editDistance(ref: string[], hyp: string[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length];
}

// -> {errors, words}: WER = errors / words; kept apart so totals sum over segments.
export function werCounts(reference: string, hypothesis: string): { errors: number; words: number } {
  const ref = words(reference);
  return { errors: editDistance(ref, words(hypothesis)), words: ref.length };
}
