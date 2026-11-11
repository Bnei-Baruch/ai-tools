import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockTime, docxDocumentXml, lessonDocumentXml, paragraphWords, paragraphsToTxt } from './export.ts';
import { chunksToSrt, parseSrt } from '../api/srt.ts';
import type { Chunk } from '../api/transcribe';

const paragraphs: Chunk[] = [
  { start: 0, end: 2, text: 'שלום לכולם', speaker: 'הרב', times: [0, 1], ends: [0.8, 1.9] },
  { start: 2, end: 3, text: 'ממשיכים', speaker: 'הרב', times: [2.1], ends: [2.9] },
  { start: 3, end: 5, text: 'קטע מספר 1', speaker: 'קריין', times: [3, 3.5, 4] },
  { start: 5, end: 6, text: 'שאלה <קטנה> & עוד', speaker: 'תלמיד' },
];

test('paragraphsToTxt: blank line between paragraphs, label where the speaker changes', () => {
  assert.equal(paragraphsToTxt(paragraphs),
    'הרב: שלום לכולם\n\nממשיכים\n\nקריין: קטע מספר 1\n\nתלמיד: שאלה <קטנה> & עוד\n');
  assert.equal(paragraphsToTxt([{ start: 0, end: 1, text: 'בלי דובר' }]), 'בלי דובר\n');
});

test('paragraphWords: the words for /diarize/words/srt, each with its paragraph speaker', () => {
  const words = paragraphWords(paragraphs);
  assert.equal(words.length, 2 + 1 + 3 + 4);
  assert.deepEqual(words[0], { word: 'שלום', start: 0, end: 0.8, speaker: 'הרב' });
  assert.deepEqual(words[2], { word: 'ממשיכים', start: 2.1, end: 2.9, speaker: 'הרב' });
  // no ends: up to the next word, the last one to the paragraph's end
  assert.deepEqual(words.slice(3, 6).map((w) => [w.start, w.end, w.speaker]), [[3, 3.5, 'קריין'], [3.5, 4, 'קריין'], [4, 5, 'קריין']]);
  // no times: spread over the paragraph
  assert.deepEqual(words.slice(6).map((w) => [w.start, w.end]), [[5, 5.25], [5.25, 5.5], [5.5, 5.75], [5.75, 6]]);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].start >= words[i - 1].start);
});

test('SRT of the recognition stage round-trips', () => {
  const chunks = [{ start: 0, end: 1.5, text: 'שלום' }, { start: 3661.25, end: 3662, text: 'עוד שורה' }];
  const srt = chunksToSrt(chunks);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nשלום\n/);
  assert.match(srt, /01:01:01,250 --> 01:01:02,000/);
  assert.deepEqual(parseSrt(srt), chunks);
});

test('docxDocumentXml: RTL paragraphs, bold labels with the word underlined, escaped text', () => {
  const doc = docxDocumentXml(paragraphs);
  assert.equal((doc.match(/<w:p>/g) ?? []).length, 4);
  assert.equal((doc.match(/<w:bidi\/>/g) ?? []).length, 5);
  assert.ok(doc.includes('<w:b/><w:bCs/><w:u w:val="single"/><w:rtl/></w:rPr><w:t xml:space="preserve">קריין</w:t></w:r>'
    + '<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:t xml:space="preserve">: </w:t>'));
  assert.ok(doc.includes('שאלה &lt;קטנה&gt; &amp; עוד'));
  assert.equal((doc.match(/<w:b\/>/g) ?? []).length, 6);
  assert.equal((doc.match(/<w:u w:val="single"\/>/g) ?? []).length, 3);
});

test('clockTime: m:ss, h:mm:ss', () => {
  assert.equal(clockTime(197), '3:17');
  assert.equal(clockTime(3725), '1:02:05');
});

test('lessonDocumentXml: header, labels where the speaker changes, a student in bold, time marks', () => {
  const long: Chunk[] = [
    { start: 0, end: 100, text: 'פתיחה', speaker: 'הרב' },
    { start: 100, end: 197, text: 'המשך', speaker: 'הרב' },
    { start: 197, end: 200, text: 'שאלה', speaker: 'תלמיד' },
    { start: 200, end: 210, text: 'תשובה', speaker: 'הרב' },
    { start: 210, end: 220, text: 'קטע', speaker: 'קריין' },
  ];
  const doc = lessonDocumentXml(long, { heading: 'תמלול שיעור 14.10.2002', title: 'שם', name: 'heb_o_rav_x_uid' });
  for (const s of ['תמלול שיעור 14.10.2002', 'heb_o_rav_x_uid', '(סוף השיעור)', 'w:fill="FFFF00"', '<w:footerReference']) {
    assert.ok(doc.includes(s), s);
  }
  // labels: הרב, תלמיד, הרב, קריין (not on the continuation)
  assert.equal((doc.match(/<w:u w:val="single"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve">[^<]+:</g) ?? []).length, 4);
  assert.ok(doc.includes('<w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:t xml:space="preserve">שאלה</w:t>'));
  assert.ok(doc.includes('<w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">תשובה</w:t>'));
  // the one time mark: at 3:17, the first paragraph end 3 minutes in
  assert.deepEqual([...doc.matchAll(/<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">([^<]+)</g)].map((m) => m[1]), ['3:17']);
});
