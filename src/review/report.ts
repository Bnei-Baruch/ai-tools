import type { ChunkReview, ReviewResult, ReviewSegment, ReviewSet } from '../api/review';
import type { Chunk } from '../api/transcribe';
import { werCounts } from './wer.ts';

// The report (TASK-stt-review.md, "3. Экран результатов"). Only `done` results count in the metrics.

// The model a result is about: the lesson's own, else what the result or the set recorded.
export const modelOf = (set: ReviewSet, segment: ReviewSegment, result?: ReviewResult) =>
  segment.model || result?.model || set.model;

export const segmentMinutes = (s: Pick<ReviewSegment, 'start' | 'end'>) => (s.end - s.start) / 60;

// A chunk counts as changed when its text differs from the model's, whatever the category says.
export const isChanged = (chunks: Chunk[], r: ChunkReview) => chunks[r.index] != null && r.corrected !== chunks[r.index].text;

const joinText = (chunks: Chunk[]) => chunks.map((c) => c.text).join(' ');

// The reviewer's corrected transcript: the reference for WER.
export function correctedText(segment: ReviewSegment, result: ReviewResult): string {
  const byIndex = new Map(result.chunks.map((r) => [r.index, r.corrected]));
  return segment.chunks.map((c, i) => byIndex.get(i) ?? c.text).join(' ');
}

export interface Row {
  segment: ReviewSegment;
  result: ReviewResult;
  minutes: number;
  a: number;
  b: number;
  c: number;
  changed: number;
  wer: { errors: number; words: number };
  baselineWer: { errors: number; words: number } | null;
}

export function rows(set: ReviewSet, results: ReviewResult[]): Row[] {
  const segments = new Map(set.segments.map((s) => [s.id, s]));
  return results.flatMap((result) => {
    const segment = segments.get(result.segment_id);
    if (!segment || result.status !== 'done') return [];
    const changed = result.chunks.filter((r) => isChanged(segment.chunks, r));
    const count = (cat: string) => changed.filter((r) => r.category === cat).length;
    const reference = correctedText(segment, result);
    return [{
      segment,
      result,
      minutes: segmentMinutes(segment),
      a: count('A'),
      b: count('B'),
      c: count('C'),
      changed: changed.length,
      wer: werCounts(reference, joinText(segment.chunks)),
      baselineWer: segment.baseline_chunks ? werCounts(reference, joinText(segment.baseline_chunks)) : null,
    }];
  });
}

export interface Summary {
  segments: number;
  minutes: number;
  aPer10: number;
  bPer10: number;
  cPer10: number;
  // share of segments without a single A error
  noA: number;
  wer: number;
  baselineWer: number | null;
  // reviewer's active seconds per minute of audio
  editSecPerMin: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function summarize(rs: Row[]): Summary {
  const minutes = sum(rs.map((r) => r.minutes));
  const per10 = (n: number) => (minutes ? (n / minutes) * 10 : 0);
  const ratio = (w: { errors: number; words: number }[]) => {
    const words = sum(w.map((x) => x.words));
    return words ? sum(w.map((x) => x.errors)) / words : 0;
  };
  const baseline = rs.map((r) => r.baselineWer).filter((w): w is NonNullable<typeof w> => !!w);
  return {
    segments: rs.length,
    minutes,
    aPer10: per10(sum(rs.map((r) => r.a))),
    bPer10: per10(sum(rs.map((r) => r.b))),
    cPer10: per10(sum(rs.map((r) => r.c))),
    noA: rs.length ? rs.filter((r) => r.a === 0).length / rs.length : 0,
    wer: ratio(rs.map((r) => r.wer)),
    // only when every row has a baseline, otherwise the two WERs cover different audio
    baselineWer: rs.length && baseline.length === rs.length ? ratio(baseline) : null,
    editSecPerMin: minutes ? sum(rs.map((r) => r.result.active_seconds)) / minutes : 0,
  };
}

// Summary per segment category, in the order categories first appear in the set
// (sets prepared in advance; lessons added by link have no category).
export function byCategory(set: ReviewSet, rs: Row[]): [string, Summary][] {
  const categories = [...new Set(set.segments.map((s) => s.category).filter((c): c is string => !!c))];
  return categories
    .map((cat): [string, Summary] => [cat, summarize(rs.filter((r) => r.segment.category === cat))])
    .filter(([, s]) => s.segments > 0);
}

export interface Disagreement {
  segment: ReviewSegment;
  reviewers: string[];
  // chunks changed by some of the reviewers but not by all
  chunks: number;
}

// Segments reviewed (done) by two or more people: where their corrections differ.
export function disagreements(rs: Row[]): Disagreement[] {
  const bySegment = new Map<string, Row[]>();
  rs.forEach((r) => bySegment.set(r.segment.id, [...(bySegment.get(r.segment.id) ?? []), r]));
  return [...bySegment.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const changedSets = group.map((r) => new Set(
        r.result.chunks.filter((c) => isChanged(r.segment.chunks, c)).map((c) => c.index),
      ));
      const union = new Set(changedSets.flatMap((s) => [...s]));
      const inAll = [...union].filter((i) => changedSets.every((s) => s.has(i)));
      return {
        segment: group[0].segment,
        reviewers: group.map((r) => r.result.reviewer_name || r.result.reviewer),
        chunks: union.size - inAll.length,
      };
    });
}

export interface ReviewerProgress {
  reviewer: string;
  name: string;
  done: number;
  inProgress: number;
  // audio minutes in the done segments
  doneMinutes: number;
  activeMinutes: number;
}

export function progress(set: ReviewSet, results: ReviewResult[]): ReviewerProgress[] {
  const segments = new Map(set.segments.map((s) => [s.id, s]));
  const reviewers = new Set(results.map((r) => r.reviewer));
  return [...reviewers].map((reviewer) => {
    const mine = results.filter((r) => r.reviewer === reviewer);
    return {
      reviewer,
      name: mine.find((r) => r.reviewer_name)?.reviewer_name ?? '',
      done: mine.filter((r) => r.status === 'done').length,
      doneMinutes: sum(mine.filter((r) => r.status === 'done').map((r) => segmentMinutes(segments.get(r.segment_id) ?? { start: 0, end: 0 }))),
      inProgress: mine.filter((r) => r.status === 'in_progress').length,
      activeMinutes: sum(mine.map((r) => r.active_seconds)) / 60,
    };
  });
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(set: ReviewSet, rs: Row[]): string {
  const header = [
    'set_id', 'model', 'baseline_model', 'segment_id', 'title', 'category', 'minutes', 'reviewer', 'reviewer_name',
    'errors_a', 'errors_b', 'errors_c', 'changed_chunks', 'chunks', 'ref_words', 'wer', 'baseline_wer',
    'active_seconds', 'updated_at',
  ];
  const lines = rs.map((r) => [
    set.id, modelOf(set, r.segment, r.result), set.baseline_model ?? '', r.segment.id, r.segment.title, r.segment.category ?? '',
    r.minutes.toFixed(2), r.result.reviewer, r.result.reviewer_name, r.a, r.b, r.c, r.changed, r.segment.chunks.length,
    r.wer.words, (r.wer.words ? r.wer.errors / r.wer.words : 0).toFixed(4),
    r.baselineWer ? (r.baselineWer.words ? r.baselineWer.errors / r.baselineWer.words : 0).toFixed(4) : '',
    r.result.active_seconds, r.result.updated_at,
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n') + '\n';
}
