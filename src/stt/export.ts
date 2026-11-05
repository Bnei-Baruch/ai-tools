// Downloads of the תמלול page: the paragraphs with their speakers as .txt / .docx, and the words for
// ai-trns /diarize/words/srt (an SRT with speakers). No browser imports: node tests use it.
import JSZip from 'jszip';
import type { Chunk } from '../api/transcribe';

export interface SpeakerWord {
  word: string;
  start: number;
  end: number;
  speaker: string | null;
}

// Paragraphs (api/speakers.ts) -> their words with the paragraph's speaker label, for /diarize/words/srt.
// A word's end: its own, else the next word's start, else the paragraph's end.
export function paragraphWords(paragraphs: Chunk[]): SpeakerWord[] {
  return paragraphs.flatMap((p) => {
    const parts = p.text.split(/\s+/).filter(Boolean);
    const timed = p.times?.length === parts.length;
    return parts.map((word, i) => {
      const start = timed ? p.times![i] : p.start + ((p.end - p.start) * i) / parts.length;
      const next = timed ? p.times![i + 1] : p.start + ((p.end - p.start) * (i + 1)) / parts.length;
      const end = (timed && p.ends?.length === parts.length ? p.ends[i] : undefined) ?? next ?? p.end;
      return { word, start, end: Math.max(start, end), speaker: p.speaker ?? null };
    });
  });
}

// A paragraph's label in the text: its speaker, "(קריאה)" after it if it reads the source
export function labelOf(p: Chunk): string | null {
  return p.speaker ? p.speaker + (p.reading ? ' (קריאה)' : '') : null;
}

// Plain text: a blank line between paragraphs, "<label>: " where the label changes
export function paragraphsToTxt(paragraphs: Chunk[]): string {
  let last: string | null | undefined;
  return paragraphs
    .map((p, i) => {
      const tag = labelOf(p);
      const label = tag && (i === 0 || tag !== last) ? `${tag}: ` : '';
      last = tag;
      return label + p.text;
    })
    .join('\n\n') + '\n';
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RUN_RTL = '<w:rPr><w:rtl/></w:rPr>';
const RUN_RTL_BOLD = '<w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr>';

// word/document.xml: a right-to-left paragraph per paragraph, the label (where it changes) in bold
export function docxDocumentXml(paragraphs: Chunk[]): string {
  let last: string | null | undefined;
  const body = paragraphs
    .map((p, i) => {
      const tag = labelOf(p);
      const label = tag && (i === 0 || tag !== last) ? tag : null;
      last = tag;
      const runs = [
        label && `<w:r>${RUN_RTL_BOLD}<w:t xml:space="preserve">${xml(label)}: </w:t></w:r>`,
        `<w:r>${RUN_RTL}<w:t xml:space="preserve">${xml(p.text)}</w:t></w:r>`,
      ].filter(Boolean).join('');
      return `<w:p><w:pPr><w:bidi/><w:spacing w:after="160"/></w:pPr>${runs}</w:p>`;
    })
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}<w:sectPr><w:bidi/></w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>';

const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// A minimal .docx of the paragraphs
export async function paragraphsToDocx(paragraphs: Chunk[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml', docxDocumentXml(paragraphs));
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_TYPE });
}
