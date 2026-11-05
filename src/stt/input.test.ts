import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputKey, parseSttInput } from './input.ts';

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
  for (const value of ['5JBUHZoo', 'https://cdn.kabbalahmedia.info/K8X56H7k']) {
    const input = parseSttInput(value)!;
    assert.deepEqual(parseSttInput(inputKey(input)), input);
  }
});
