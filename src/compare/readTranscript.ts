import JSZip from 'jszip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export const isTranscriptFile = (f: File) => /\.(docx|txt)$/i.test(f.name) || f.type === 'text/plain';

// A .docx or .txt -> plain text, a line per paragraph.
export async function readTranscript(file: File): Promise<string> {
  if (!/\.docx$/i.test(file.name)) return file.text();

  let xml: string | undefined;
  try {
    xml = await (await JSZip.loadAsync(file)).file('word/document.xml')?.async('string');
  } catch {
    // not a zip
  }
  if (!xml) throw new Error('הקובץ אינו מסמך Word תקין');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs: string[] = [];
  let current = '';
  // Document order: w:t is text (w:delText, deleted in tracked changes, is not), w:tab / w:br break words.
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.namespaceURI !== W) continue;
      switch (child.localName) {
        case 'p':
          walk(child);
          paragraphs.push(current);
          current = '';
          break;
        case 't':
          current += child.textContent ?? '';
          break;
        case 'tab':
          current += ' ';
          break;
        case 'br':
        case 'cr':
          current += '\n';
          break;
        default:
          walk(child);
      }
    }
  };
  walk(doc.documentElement);
  return paragraphs.map((p) => p.trim()).filter(Boolean).join('\n');
}
