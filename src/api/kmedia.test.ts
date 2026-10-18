import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnitUid, pickFiles, type ContentUnit } from './kmedia.ts';

test('parseUnitUid', () => {
  assert.equal(parseUnitUid('https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo?c=Ncne8kH2&mediaType=video'), '5JBUHZoo');
  assert.equal(parseUnitUid('https://kabbalahmedia.info/backend/content_units/5JBUHZoo'), null);
  assert.equal(parseUnitUid(' 5JBUHZoo '), '5JBUHZoo');
  assert.equal(parseUnitUid('https://kabbalahmedia.info/he/lessons'), null);
  assert.equal(parseUnitUid('not a link'), null);
});

const file = (id: string, language: string, type: string, mimetype: string, video_size?: string) =>
  ({ id, name: id, size: 1, language, type, mimetype, video_size });

test('pickFiles: original-language mp3 and the lightest mp4', () => {
  const unit: ContentUnit = {
    id: 'u', name: 'n', original_language: 'he',
    files: [
      file('en-a', 'en', 'audio', 'audio/mpeg'),
      file('he-hd', 'he', 'video', 'video/mp4', 'HD'),
      file('he-a', 'he', 'audio', 'audio/mpeg'),
      file('he-doc', 'he', 'text', 'application/msword'),
      file('he-nhd', 'he', 'video', 'video/mp4', 'nHD'),
    ],
  };
  const { audio, video } = pickFiles(unit);
  assert.equal(audio?.id, 'he-a');
  assert.equal(video?.id, 'he-nhd');
});
