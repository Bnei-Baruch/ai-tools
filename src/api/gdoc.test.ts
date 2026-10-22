import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docId, docUrl } from './gdoc.ts';

test('a Google Docs link gives its document id', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.equal(docId(`https://docs.google.com/document/d/${id}/edit?tab=t.0`), id);
  assert.equal(docId(`https://docs.google.com/document/u/1/d/${id}/edit`), id);
  assert.equal(docId(docUrl(id)), id);
  assert.equal(docId('https://example.org/document'), null);
});
