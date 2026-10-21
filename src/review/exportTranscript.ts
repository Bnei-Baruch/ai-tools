import JSZip from 'jszip';
import type { ChunkReview } from '../api/review';
import type { Chunk } from '../api/transcribe';

// The lesson's transcript as the reviewer left it: corrected lines instead of the model's.
// Times stay absolute (within the media file), as in the chunks.

export type ExportFormat = 'txt' | 'srt' | 'docx';

export const reviewedChunks = (chunks: Chunk[], edits: Record<number, ChunkReview>): Chunk[] =>
  chunks.map((c, i) => (edits[i] ? { ...c, text: edits[i].corrected } : c));

// txt and docx: one continuous text, no line breaks
export const plainText = (chunks: Chunk[]) => chunks.map((c) => c.text.trim()).filter(Boolean).join(' ');

export const toTxt = plainText;

// seconds -> "HH:MM:SS,mmm"
export function srtTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export const toSrt = (chunks: Chunk[]) =>
  chunks.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A minimal .docx: the whole text in one right-to-left paragraph.
export function toDocx(chunks: Chunk[]): Promise<Blob> {
  const paragraph = `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">${escapeXml(plainText(chunks))}</w:t></w:r></w:p>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${paragraph}<w:sectPr><w:bidi/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function transcriptBlob(chunks: Chunk[], format: ExportFormat): Promise<Blob> {
  if (format === 'docx') return toDocx(chunks);
  const type = format === 'srt' ? 'application/x-subrip' : 'text/plain';
  return new Blob([format === 'srt' ? toSrt(chunks) : toTxt(chunks)], { type: `${type};charset=utf-8` });
}

// the lesson's title, without characters file systems refuse
export const exportFileName = (title: string, format: ExportFormat) =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'transcript'}.${format}`;
