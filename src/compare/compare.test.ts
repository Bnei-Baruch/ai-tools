import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffKeys } from './diff.ts';
import { compare, humanWords, modelWords, suggestCorrection, wordAt } from './compare.ts';

const apply = (a: string[], b: string[]) => {
  const ops = diffKeys(a, b);
  // every index on each side exactly once, in order
  assert.deepEqual(ops.flatMap((o) => (o.op === 'ins' ? [] : [o.a])), a.map((_, i) => i));
  assert.deepEqual(ops.flatMap((o) => (o.op === 'del' ? [] : [o.b])), b.map((_, i) => i));
  return ops.filter((o) => o.op !== 'same').length;
};

test('diffKeys: equal, empty, simple edits', () => {
  assert.equal(apply(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
  assert.equal(apply([], ['a']), 1);
  assert.equal(apply(['a'], []), 1);
  assert.equal(apply(['a', 'b', 'c'], ['a', 'x', 'c']), 2);
  assert.equal(apply(['a', 'a', 'b', 'a'], ['a', 'b', 'a', 'a']), 2);
});

test('diffKeys: a whole lesson diffs fast and minimal around the edits', () => {
  const vocab = Array.from({ length: 300 }, (_, i) => `w${i}`);
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const a = Array.from({ length: 15000 }, () => vocab[Math.floor(rand() * vocab.length)]);
  const b = a.slice();
  b.splice(5000, 1, 'X');
  b.splice(10000, 0, 'Y', 'Z');
  b.splice(12000, 1);
  const started = Date.now();
  assert.equal(apply(a, b), 5);
  assert.ok(Date.now() - started < 3000);
});

test('humanWords: paragraphs from line breaks', () => {
  const words = humanWords('שלום עולם\r\n\r\nמה  נשמע\n');
  assert.deepEqual(words.map((w) => [w.text, w.group]), [['שלום', 0], ['עולם', 0], ['מה', 1], ['נשמע', 1]]);
});

test('modelWords: spread over the chunk by length', () => {
  const words = modelWords([{ start: 10, end: 20, text: 'אב אב' }]);
  assert.deepEqual(words.map((w) => w.time), [10, 15]);
});

test('compare: punctuation, niqqud and maqaf are not differences', () => {
  const c = compare('בְּרֵאשִׁית, בית־הכנסת.', [{ start: 0, end: 4, text: 'בראשית בית הכנסת' }]);
  assert.equal(c.hunks.length, 0);
  assert.ok(c.human.every((w) => w.hunk < 0));
});

test('compare: hunks on both sides, with times', () => {
  const c = compare('אחד שתיים שלוש ארבע חמש', [
    { start: 0, end: 4, text: 'אחד שתיים' },
    { start: 4, end: 8, text: 'שלש ארבע חמש שש' },
  ]);
  assert.deepEqual(c.hunks.map((h) => [h.human, h.model]), [['שלוש', 'שלש'], ['', 'שש']]);
  assert.equal(c.hunks[0].time, 4);
  assert.equal(c.human[2].time, 4);
  assert.equal(c.human[2].hunk, 0);
  // missing on the person's side: after their last word
  assert.equal(c.hunks[1].humanWord, 5);
  assert.equal(c.model[5].hunk, 1);
  // the person's words follow the model's times
  assert.equal(c.human[3].time, c.model[3].time);
});

test('compare: a word only the person wrote seeks to the word before it', () => {
  const c = compare('אחד שתיים שלוש', [{ start: 0, end: 6, text: 'אחד שלוש' }]);
  assert.deepEqual(c.hunks.map((h) => [h.human, h.model, h.time]), [['שתיים', '', 0]]);
  assert.equal(c.hunks[0].modelWord, 1);
});

test('wordAt', () => {
  const words = modelWords([{ start: 0, end: 2, text: 'א ב' }]);
  assert.equal(wordAt(words, -1), -1);
  assert.equal(wordAt(words, 0.5), 0);
  assert.equal(wordAt(words, 9), 1);
});

test('suggestCorrection: the person\'s words replace the model\'s in its chunk', () => {
  const c = compare('אחד שתיים שלוש ארבע', [
    { start: 0, end: 2, text: 'אחד שתים' },
    { start: 2, end: 4, text: 'שלוש ארבע חמש' },
  ]);
  assert.deepEqual(c.hunks.map((h) => [h.human, h.model]), [['שתיים', 'שתים'], ['', 'חמש']]);
  assert.deepEqual(suggestCorrection(c, 0), { chunk: 0, text: 'אחד שתיים' });
  // the model added a word: it goes
  assert.deepEqual(suggestCorrection(c, 1), { chunk: 1, text: 'שלוש ארבע' });
});

test('suggestCorrection: words the model missed are inserted where they belong', () => {
  const c = compare('אחד שתיים שלוש', [{ start: 0, end: 2, text: 'אחד שלוש' }]);
  assert.deepEqual(suggestCorrection(c, 0), { chunk: 0, text: 'אחד שתיים שלוש' });
  const end = compare('אחד שתיים', [{ start: 0, end: 2, text: 'אחד' }]);
  assert.deepEqual(suggestCorrection(end, 0), { chunk: 0, text: 'אחד שתיים' });
});
