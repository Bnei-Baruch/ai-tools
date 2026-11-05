import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, inputKey, parseSttInput, parseTime } from './input.ts';

test('parseSttInput: a lesson link or uid', () => {
  assert.deepEqual(parseSttInput('https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo?c=Ncne8kH2&mediaType=video'),
    { kind: 'lesson', uid: '5JBUHZoo' });
  assert.deepEqual(parseSttInput('https://kabbalahmedia.info/ru/lessons/cu/5JBUHZoo'), { kind: 'lesson', uid: '5JBUHZoo' });
  assert.deepEqual(parseSttInput('  5JBUHZoo\n'), { kind: 'lesson', uid: '5JBUHZoo' });
});

test('parseSttInput: a direct media link', () => {
  assert.deepEqual(parseSttInput('https://cdn.kabbalahmedia.info/K8X56H7k'), { kind: 'media', url: 'https://cdn.kabbalahmedia.info/K8X56H7k' });
  assert.deepEqual(parseSttInput(' http://example.com/a b.mp3 '), { kind: 'media', url: 'http://example.com/a%20b.mp3' });
});

test('parseSttInput: anything else', () => {
  assert.equal(parseSttInput(''), null);
  assert.equal(parseSttInput('   '), null);
  assert.equal(parseSttInput('not a link'), null);
  assert.equal(parseSttInput('javascript:alert(1)'), null);
  assert.equal(parseSttInput('ftp://example.com/a.mp3'), null);
  assert.equal(parseSttInput('5JBUHZo'), null);
});

test('inputKey: what goes into the address round-trips', () => {
  for (const value of ['5JBUHZoo', 'https://cdn.kabbalahmedia.info/K8X56H7k',
    'https://kabbalahmedia.info/lessons/cu/HHQxx4Wk?sstart=3m17s&send=5m43s',
    'https://kabbalahmedia.info/lessons/cu/HHQxx4Wk?sstart=1h0m5s']) {
    const input = parseSttInput(value)!;
    assert.deepEqual(parseSttInput(inputKey(input)), input);
  }
});

test('parseSttInput: a part of a lesson (sstart / send)', () => {
  assert.deepEqual(parseSttInput('https://kabbalahmedia.info/lessons/cu/HHQxx4Wk?sstart=3m17s&send=5m43s'),
    { kind: 'lesson', uid: 'HHQxx4Wk', clip: { start: 197, end: 343 } });
  assert.deepEqual(parseSttInput('https://kabbalahmedia.info/he/lessons/cu/HHQxx4Wk?sstart=1h2m3s'),
    { kind: 'lesson', uid: 'HHQxx4Wk', clip: { start: 3723, end: null } });
  assert.deepEqual(parseSttInput('https://kabbalahmedia.info/lessons/cu/HHQxx4Wk?send=43s'),
    { kind: 'lesson', uid: 'HHQxx4Wk', clip: { start: 0, end: 43 } });
  // no part, or not a valid one: the whole lesson
  for (const q of ['', '?sstart=0s', '?sstart=5m&send=3m', '?sstart=abc']) {
    assert.deepEqual(parseSttInput(`https://kabbalahmedia.info/lessons/cu/HHQxx4Wk${q}`), { kind: 'lesson', uid: 'HHQxx4Wk' });
  }
});

test('parseTime / formatTime', () => {
  assert.equal(parseTime('3m17s'), 197);
  assert.equal(parseTime('03:17'), 197);
  assert.equal(parseTime('197'), 197);
  assert.equal(parseTime('x'), null);
  assert.equal(formatTime(197), '3m17s');
  assert.equal(formatTime(3723), '1h2m3s');
  assert.equal(formatTime(43), '43s');
  assert.equal(formatTime(3600), '1h0m0s');
});
