import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewResult, ReviewSet } from '../api/review';
import { disagreements, progress, rows, summarize, toCsv } from './report.ts';

const set: ReviewSet = {
  id: 'set1',
  model: 'm1',
  baseline_model: 'base',
  segments: [
    {
      id: 's1', title: 'one', category: 'reading', media_url: '', start: 0, end: 300,
      chunks: [{ start: 0, end: 5, text: 'אני יודע טוב' }, { start: 5, end: 10, text: 'שלום עולם' }],
      baseline_chunks: [{ start: 0, end: 10, text: 'אני יודע טוב שלום' }],
    },
    {
      id: 's2', title: 'two, "quoted"', category: 'old_recording', media_url: '', start: 0, end: 300,
      chunks: [{ start: 0, end: 5, text: 'אחת שתיים' }],
    },
  ],
};

const result = (reviewer: string, segment_id: string, chunks: ReviewResult['chunks'], status: ReviewResult['status'] = 'done'): ReviewResult => ({
  set_id: 'set1', segment_id, model: 'm1', reviewer, reviewer_name: reviewer.toUpperCase(), status, chunks,
  position: 0, active_seconds: 600, updated_at: '2026-10-18T00:00:00Z',
});

const results = [
  result('r1', 's1', [
    { index: 0, corrected: 'אני לא יודע טוב', category: 'A' },
    // a comment on an unchanged chunk is not an error
    { index: 1, corrected: 'שלום עולם', category: null, comment: 'רעש' },
  ]),
  result('r1', 's2', [{ index: 0, corrected: 'אחת, שתיים.', category: 'C' }]),
  result('r2', 's1', [{ index: 1, corrected: 'שלום לעולם', category: 'B' }]),
  result('r2', 's2', [], 'in_progress'),
];

test('rows: only done results, categories of changed chunks, WER against the corrected text', () => {
  const rs = rows(set, results);
  assert.equal(rs.length, 3);
  const [r1s1, r1s2, r2s1] = rs;
  assert.deepEqual([r1s1.a, r1s1.b, r1s1.c, r1s1.changed], [1, 0, 0, 1]);
  assert.deepEqual(r1s1.wer, { errors: 1, words: 6 });
  // baseline "אני יודע טוב שלום" vs "אני לא יודע טוב שלום עולם"
  assert.deepEqual(r1s1.baselineWer, { errors: 2, words: 6 });
  // punctuation-only correction: a C error, but no WER
  assert.deepEqual([r1s2.c, r1s2.wer.errors], [1, 0]);
  assert.equal(r1s2.baselineWer, null);
  assert.equal(r2s1.b, 1);
});

test('summarize: errors per 10 minutes, share without A, pooled WER', () => {
  const s = summarize(rows(set, results));
  assert.equal(s.segments, 3);
  assert.equal(s.minutes, 15);
  assert.ok(Math.abs(s.aPer10 - 10 / 15) < 1e-9);
  assert.ok(Math.abs(s.noA - 2 / 3) < 1e-9);
  // (1 + 0 + 1) errors / (6 + 2 + 5) words
  assert.ok(Math.abs(s.wer - 2 / 13) < 1e-9);
  // s2 has no baseline -> no baseline WER for the mix
  assert.equal(s.baselineWer, null);
  assert.equal(s.editSecPerMin, 1800 / 15);
});

test('summarize of nothing', () => {
  assert.deepEqual(summarize([]), {
    segments: 0, minutes: 0, aPer10: 0, bPer10: 0, cPer10: 0, noA: 0, wer: 0, baselineWer: null, editSecPerMin: 0,
  });
});

test('disagreements: chunks changed by one reviewer only', () => {
  const d = disagreements(rows(set, results));
  assert.equal(d.length, 1);
  assert.equal(d[0].segment.id, 's1');
  assert.deepEqual(d[0].reviewers, ['R1', 'R2']);
  assert.equal(d[0].chunks, 2);
});

test('progress per reviewer', () => {
  assert.deepEqual(progress(set, results).map(({ reviewer, done, inProgress, doneMinutes }) => [reviewer, done, inProgress, doneMinutes]), [
    ['r1', 2, 0, 10],
    ['r2', 1, 1, 5],
  ]);
});

test('toCsv quotes cells with commas and quotes', () => {
  const csv = toCsv(set, rows(set, results));
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[2].includes('"two, ""quoted"""'));
});
