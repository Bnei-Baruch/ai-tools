import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docId, docUrl, googleAccount } from './gdoc.ts';

test('a Google Docs link gives its document id', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.equal(docId(`https://docs.google.com/document/d/${id}/edit?tab=t.0`), id);
  assert.equal(docId(`https://docs.google.com/document/u/1/d/${id}/edit`), id);
  assert.equal(docId(docUrl(id)), id);
  assert.equal(docId('https://example.org/document'), null);
});

test('the account this browser used last comes before the configured one', () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
  });
  try {
    assert.equal(googleAccount('config@example.org'), 'config@example.org');
    assert.equal(googleAccount(''), '');
    store.set('gdoc.account', 'chosen@example.org');
    assert.equal(googleAccount('config@example.org'), 'chosen@example.org');
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('no storage: the configured account', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(googleAccount('config@example.org'), 'config@example.org');
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
