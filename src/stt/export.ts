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

// Plain text: a blank line between paragraphs, "<label>: " where the speaker changes
export function paragraphsToTxt(paragraphs: Chunk[]): string {
  let last: string | null | undefined;
  return paragraphs
    .map((p, i) => {
      const label = p.speaker && (i === 0 || p.speaker !== last) ? `${p.speaker}: ` : '';
      last = p.speaker;
      return label + p.text;
    })
    .join('\n\n') + '\n';
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RUN_RTL = '<w:rPr><w:rtl/></w:rPr>';
const RUN_RTL_BOLD = '<w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr>';
const RUN_RTL_BOLD_UNDERLINE = '<w:rPr><w:b/><w:bCs/><w:u w:val="single"/><w:rtl/></w:rPr>';

// word/document.xml: a right-to-left paragraph per paragraph, the label (where the speaker changes) in bold,
// the label's word underlined (not the colon)
export function docxDocumentXml(paragraphs: Chunk[]): string {
  let last: string | null | undefined;
  const body = paragraphs
    .map((p, i) => {
      const label = p.speaker && (i === 0 || p.speaker !== last) ? p.speaker : null;
      last = p.speaker;
      const runs = [
        label && `<w:r>${RUN_RTL_BOLD_UNDERLINE}<w:t xml:space="preserve">${xml(label)}</w:t></w:r>`
          + `<w:r>${RUN_RTL_BOLD}<w:t xml:space="preserve">: </w:t></w:r>`,
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

// ---- A .docx laid out as the lessons' typed transcripts (heb_o_rav_…_<uid>.doc): a yellow "raw, not proofread"
// box, the date and the lesson's name centered, the file's name; then Arial 12 justified right-to-left paragraphs
// with a first-line indent, "הרב:" / "תלמיד:" bold and underlined where the speaker changes, a student's words in
// bold, a blank line before a new exchange, the time (yellow) every few minutes, "(סוף השיעור)", page numbers.

export interface LessonDocHeader {
  // "תמלול שיעור 14.10.2002"
  heading?: string;
  // the lesson's name
  title?: string;
  // "heb_o_rav_2002-10-14_lesson_…_n1_lT4XU7v9"
  name?: string;
  // the lesson's page in kabbalahmedia, a link under the file's name
  link?: string;
  // "(סוף השיעור)"
  ending?: string;
}

export const LESSON_DOC_NOTE = 'תמלול אוטומטי ללא הגהות. ייתכנו טעויות.';
const STUDENT = 'תלמיד';
// a time mark at a paragraph's end once this long passed since the last one
const MARK_EVERY = 180;

// 197 -> "3:17", 3725 -> "1:02:05"
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

interface RunStyle {
  b?: boolean;
  u?: boolean;
  sz?: number;
  highlight?: boolean;
  ltr?: boolean;
  link?: boolean;
}

function run(text: string, s: RunStyle = {}): string {
  const pr = [
    s.b && '<w:b/><w:bCs/>',
    s.sz && `<w:sz w:val="${s.sz}"/><w:szCs w:val="${s.sz}"/>`,
    s.highlight && '<w:highlight w:val="yellow"/>',
    s.link && '<w:color w:val="0563C1"/>',
    (s.u || s.link) && '<w:u w:val="single"/>',
    !s.ltr && '<w:rtl/>',
  ].filter(Boolean).join('');
  return `<w:r><w:rPr>${pr}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

const para = (runs: string, jc?: 'center' | 'left') =>
  `<w:p>${jc ? `<w:pPr><w:ind w:firstLine="0"/><w:jc w:val="${jc}"/></w:pPr>` : ''}${runs}</w:p>`;
const EMPTY = '<w:p/>';

const NOTE_BOX = '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="3962" w:type="dxa"/><w:jc w:val="right"/>'
  + '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
  + '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
  + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
  + '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>'
  + '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="3962"/></w:tblGrid>'
  + '<w:tr><w:tc><w:tcPr><w:tcW w:w="3962" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/></w:tcPr>'
  + `<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${run(LESSON_DOC_NOTE, { sz: 20 })}</w:p>`
  + '</w:tc></w:tr></w:tbl>';

// word/document.xml of the lesson-style .docx
export function lessonDocumentXml(paragraphs: Chunk[], header: LessonDocHeader = {}): string {
  const out: string[] = [NOTE_BOX, EMPTY];
  if (header.heading) out.push(para(run(header.heading, { b: true, sz: 36, u: true }), 'center'));
  out.push(EMPTY, EMPTY);
  if (header.title) out.push(para(run(header.title, { b: true, sz: 32, u: true }), 'center'));
  if (header.name) out.push(para(run(header.name, { sz: 20, ltr: true }), 'center'));
  if (header.link) {
    const link = run(header.link, { sz: 20, ltr: true, link: true });
    out.push(para(`<w:hyperlink r:id="rIdLink" w:history="1">${link}</w:hyperlink>`, 'center'));
  }
  out.push(EMPTY, EMPTY);

  let last: string | null | undefined;
  let marked = paragraphs[0]?.start ?? 0;
  paragraphs.forEach((p, i) => {
    const label = p.speaker && (i === 0 || p.speaker !== last) ? p.speaker : null;
    // a new exchange: a blank line before it, but the answer goes right under the question
    if (label && i > 0 && last !== STUDENT) out.push(EMPTY);
    last = p.speaker;
    const runs = [
      label && run(`${label}:`, { b: true, u: true }) + run(' ', { b: true }),
      run(p.text, { b: p.speaker === STUDENT }),
    ];
    if (p.end - marked >= MARK_EVERY) {
      marked = p.end;
      runs.push(run(' '), run(clockTime(p.end), { highlight: true, ltr: true }));
    }
    out.push(para(runs.filter(Boolean).join('')));
  });

  out.push(EMPTY, EMPTY, para(run(header.ending ?? '(סוף השיעור)', { b: true }), 'center'));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<w:body>${out.join('')}`
    + '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>'
    + '<w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440" w:header="0" w:footer="709" w:gutter="0"/>'
    + '<w:bidi/><w:rtlGutter/></w:sectPr></w:body></w:document>';
}

const LESSON_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
  + '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:bidi="he-IL"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>'
  + '<w:pPr><w:widowControl/><w:bidi/><w:ind w:left="0" w:right="0" w:firstLine="284"/><w:jc w:val="both"/></w:pPr>'
  + '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>'
  + '</w:styles>';

const LESSON_FOOTER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>'
  + '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>';

const lessonDocRels = (link?: string) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
  + (link
    ? '<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"'
      + ` Target="${xml(link)}" TargetMode="External"/>`
    : '')
  + '</Relationships>';

const LESSON_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
  + '</Types>';

// The paragraphs as a .docx laid out as the lessons' typed transcripts
export async function paragraphsToLessonDocx(paragraphs: Chunk[], header: LessonDocHeader = {}): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', LESSON_CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml', lessonDocumentXml(paragraphs, header));
  zip.file('word/styles.xml', LESSON_STYLES);
  zip.file('word/footer1.xml', LESSON_FOOTER);
  zip.file('word/_rels/document.xml.rels', lessonDocRels(header.link));
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_TYPE });
}
