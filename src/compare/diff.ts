// Word diff for whole lessons (thousands of words on each side), where a plain LCS table won't fit:
// patience diff -- words that occur once on each side anchor the two texts, and only the short
// stretches between anchors get an LCS. Where no single word is unique, runs of 2..4 words are.

export type Op = { op: 'same'; a: number; b: number } | { op: 'del'; a: number } | { op: 'ins'; b: number };

// A stretch without anchors bigger than this (a.length * b.length) is taken as replaced wholesale.
const MAX_LCS_CELLS = 4_000_000;
const MAX_ANCHOR_WORDS = 4;

// a -> b, as indices into both.
export function diffKeys(a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  diffRange(a, 0, a.length, b, 0, b.length, ops);
  return ops;
}

function diffRange(a: string[], a0: number, a1: number, b: string[], b0: number, b1: number, ops: Op[]) {
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) ops.push({ op: 'same', a: a0++, b: b0++ });
  const tail: Op[] = [];
  while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) tail.push({ op: 'same', a: --a1, b: --b1 });

  if (a0 === a1 || b0 === b1) {
    replaced(a0, a1, b0, b1, ops);
  } else {
    let anchors: [number, number][] = [];
    for (let n = 1; n <= MAX_ANCHOR_WORDS && anchors.length === 0; n++) anchors = uniqueAnchors(a, a0, a1, b, b0, b1, n);
    if (anchors.length > 0) {
      let i = a0;
      let j = b0;
      for (const [ai, bj] of anchors) {
        diffRange(a, i, ai, b, j, bj, ops);
        ops.push({ op: 'same', a: ai, b: bj });
        i = ai + 1;
        j = bj + 1;
      }
      diffRange(a, i, a1, b, j, b1, ops);
    } else if ((a1 - a0) * (b1 - b0) <= MAX_LCS_CELLS) {
      lcs(a, a0, a1, b, b0, b1, ops);
    } else {
      replaced(a0, a1, b0, b1, ops);
    }
  }

  for (let k = tail.length - 1; k >= 0; k--) ops.push(tail[k]);
}

function replaced(a0: number, a1: number, b0: number, b1: number, ops: Op[]) {
  for (let i = a0; i < a1; i++) ops.push({ op: 'del', a: i });
  for (let j = b0; j < b1; j++) ops.push({ op: 'ins', b: j });
}

// Runs of n words that occur exactly once in a[a0..a1) and once in b[b0..b1), as [ai, bj] pairs of
// their first words, cut down to the longest chain that is in order on both sides (patience sorting).
function uniqueAnchors(
  a: string[], a0: number, a1: number, b: string[], b0: number, b1: number, n: number,
): [number, number][] {
  const gram = (s: string[], i: number) => (n === 1 ? s[i] : s.slice(i, i + n).join(' '));
  const inA = new Map<string, number>();
  for (let i = a0; i + n <= a1; i++) {
    const g = gram(a, i);
    inA.set(g, inA.has(g) ? -1 : i);
  }
  const inB = new Map<string, number>();
  for (let j = b0; j + n <= b1; j++) {
    const g = gram(b, j);
    inB.set(g, inB.has(g) ? -1 : j);
  }

  const pairs: [number, number][] = [];
  for (let i = a0; i + n <= a1; i++) {
    const g = gram(a, i);
    const j = inB.get(g);
    if (j !== undefined && j >= 0 && inA.get(g) === i) pairs.push([i, j]);
  }

  // longest increasing subsequence of the b indices (pairs are already ordered by a)
  const tops: number[] = []; // tops[k]: index into pairs of the smallest tail of a run of length k+1
  const prev = new Array<number>(pairs.length).fill(-1);
  for (let p = 0; p < pairs.length; p++) {
    let lo = 0;
    let hi = tops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tops[mid]][1] < pairs[p][1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[p] = tops[lo - 1];
    tops[lo] = p;
  }
  const run: [number, number][] = [];
  for (let p = tops.length ? tops[tops.length - 1] : -1; p >= 0; p = prev[p]) run.push(pairs[p]);
  return run.reverse();
}

function lcs(a: string[], a0: number, a1: number, b: string[], b0: number, b1: number, ops: Op[]) {
  const n = a1 - a0;
  const m = b1 - b0;
  const w = m + 1;
  // t[i * w + j]: LCS length of a[a0 + i..a1) and b[b0 + j..b1)
  const t = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = a[a0 + i] === b[b0 + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[a0 + i] === b[b0 + j]) ops.push({ op: 'same', a: a0 + i++, b: b0 + j++ });
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) ops.push({ op: 'del', a: a0 + i++ });
    else ops.push({ op: 'ins', b: b0 + j++ });
  }
  replaced(a0 + i, a1, b0 + j, b1, ops);
}
