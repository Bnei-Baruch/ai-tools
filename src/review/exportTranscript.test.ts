import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { exportFileName, reviewedChunks, srtTime, toDocx, toSrt, toTxt } from './exportTranscript.ts';

const chunks = [
  { start: 0, end: 2.5, text: 'שלום עולם' },
  { start: 3661.007, end: 3663, text: 'שורה <שנייה> & עוד' },
];

test('reviewedChunks takes the corrected lines', () => {
  const out = reviewedChunks(chunks, { 1: { index: 1, corrected: 'תוקן', category: 'A' } });
  assert.deepEqual(out.map((c) => c.text), ['שלום עולם', 'תוקן']);
  assert.equal(out[1].start, 3661.007);
});

test('srtTime', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(3661.007), '01:01:01,007');
});

test('toTxt and toSrt', () => {
  assert.equal(toTxt(chunks), 'שלום עולם\nשורה <שנייה> & עוד\n');
  assert.equal(toSrt(chunks),
    '1\n00:00:00,000 --> 00:00:02,500\nשלום עולם\n\n2\n01:01:01,007 --> 01:01:03,000\nשורה <שנייה> & עוד\n');
});

test('toDocx writes an escaped paragraph per line', async () => {
  const zip = await JSZip.loadAsync(await (await toDocx(chunks)).arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.equal(xml.match(/<w:p>/g)?.length, 2);
  assert.ok(xml.includes('שורה &lt;שנייה&gt; &amp; עוד'));
});

test('exportFileName drops characters file systems refuse', () => {
  assert.equal(exportFileName('שיעור: "בוקר" 1/2', 'srt'), 'שיעור בוקר 1 2.srt');
  assert.equal(exportFileName('  ', 'txt'), 'transcript.txt');
});
