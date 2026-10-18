// kabbalahmedia.info content units: a lesson link -> its Hebrew audio and video files.

const BACKEND = 'https://kabbalahmedia.info/backend';
const CDN = 'https://cdn.kabbalahmedia.info';

export interface KmediaFile {
  id: string;
  name: string;
  size: number;
  duration?: number;
  language: string;
  mimetype: string;
  type: string;
  video_size?: string;
}

export interface ContentUnit {
  id: string;
  name: string;
  film_date?: string;
  duration?: number;
  original_language?: string;
  files: KmediaFile[];
}

// "https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo?c=...", ".../cu/5JBUHZoo" or just "5JBUHZoo" -> "5JBUHZoo"
export function parseUnitUid(input: string): string | null {
  const text = input.trim();
  if (/^[A-Za-z0-9]{8}$/.test(text)) return text;
  try {
    const parts = new URL(text).pathname.split('/').filter(Boolean);
    const at = parts.indexOf('cu');
    const uid = at >= 0 ? parts[at + 1] : undefined;
    return uid && /^[A-Za-z0-9]{8}$/.test(uid) ? uid : null;
  } catch {
    return null;
  }
}

export async function fetchUnit(uid: string): Promise<ContentUnit> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND}/content_units/${encodeURIComponent(uid)}`);
  } catch {
    throw new Error('kabbalahmedia.info אינו זמין');
  }
  if (res.status === 404) throw new Error('השיעור לא נמצא');
  if (!res.ok) throw new Error(`kabbalahmedia.info: ${res.status}`);
  return res.json();
}

export const fileUrl = (f: KmediaFile) => `${CDN}/${f.id}`;

const VIDEO_SIZES = ['nHD', 'HD', 'FHD'];

// The original-language (Hebrew) audio to transcribe, and a light video of it to watch.
export function pickFiles(unit: ContentUnit): { audio?: KmediaFile; video?: KmediaFile } {
  const lang = unit.original_language || 'he';
  const own = unit.files.filter((f) => f.language === lang);
  const audio = own.find((f) => f.type === 'audio' && f.mimetype === 'audio/mpeg');
  const video = own
    .filter((f) => f.type === 'video' && f.mimetype === 'video/mp4')
    .sort((a, b) => VIDEO_SIZES.indexOf(a.video_size ?? '') - VIDEO_SIZES.indexOf(b.video_size ?? ''))[0];
  return { audio, video };
}
