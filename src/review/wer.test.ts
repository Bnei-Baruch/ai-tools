import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffText, editDistance, normalize, werCounts, words } from './wer.ts';

test('normalize strips niqqud and cantillation', () => {
  assert.equal(normalize('בְּרֵאשִׁ֖ית בָּרָ֣א'), 'בראשית ברא');
});

test('normalize strips punctuation, quotes, geresh and gershayim', () => {
  assert.equal(normalize('"שלום," אמר. מה?! (כן)'), 'שלום אמר מה כן');
  assert.equal(normalize('תע״ס, ג׳ירפה'), 'תעס גירפה');
  assert.equal(normalize('תע"ס, ג\'ירפה'), 'תעס גירפה');
});

test('normalize splits on hyphen and maqaf', () => {
  assert.equal(normalize('בית־הכנסת'), 'בית הכנסת');
  assert.equal(normalize('בית-הכנסת'), 'בית הכנסת');
});

test('normalize keeps final letters', () => {
  assert.equal(normalize('שלום'), 'שלום');
  assert.notEqual(normalize('שלומ'), normalize('שלום'));
});

test('normalize collapses whitespace and lowercases latin', () => {
  assert.equal(normalize('  Zohar   הזוהר\n'), 'zohar הזוהר');
});

test('words of an empty or punctuation-only text', () => {
  assert.deepEqual(words(''), []);
  assert.deepEqual(words(' ... '), []);
});

test('editDistance', () => {
  assert.equal(editDistance(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
  assert.equal(editDistance(['a', 'b', 'c'], ['a', 'x', 'c']), 1);
  assert.equal(editDistance(['a', 'b', 'c'], ['a', 'c']), 1);
  assert.equal(editDistance(['a', 'b'], ['a', 'b', 'c', 'd']), 2);
  assert.equal(editDistance([], ['a']), 1);
  assert.equal(editDistance(['a'], []), 1);
});

test('werCounts ignores punctuation and niqqud differences', () => {
  assert.deepEqual(werCounts('שָׁלוֹם, עוֹלָם.', 'שלום עולם'), { errors: 0, words: 2 });
  assert.deepEqual(werCounts('אני לא יודע', 'אני יודע'), { errors: 1, words: 3 });
});

test('diffText marks removed and added words, ignoring punctuation', () => {
  assert.deepEqual(diffText('אני יודע, טוב', 'אני לא יודע טוב.'), [
    { op: 'same', word: 'אני' },
    { op: 'ins', word: 'לא' },
    { op: 'same', word: 'יודע' },
    { op: 'same', word: 'טוב.' },
  ]);
  assert.deepEqual(diffText('מילה אחת', 'מילה שתיים'), [
    { op: 'same', word: 'מילה' },
    { op: 'del', word: 'אחת' },
    { op: 'ins', word: 'שתיים' },
  ]);
});
