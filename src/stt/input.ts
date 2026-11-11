// What the תמלול page is given: a kabbalahmedia lesson (its link or uid) or a direct media link.
import { parseUnitUid } from '../api/kmedia.ts';

// A part of the lesson (seconds of the lesson; end null: to its end): only it is transcribed, the times stay the
// lesson's. From the link's ?sstart=3m17s&send=5m43s (kabbalahmedia's "share a part" link).
export interface Clip {
  start: number;
  end: number | null;
}

export type SttInput = { kind: 'lesson'; uid: string; clip?: Clip } | { kind: 'media'; url: string };

// "3m17s", "1h2m3s", "197", "03:17" -> seconds; null if not a time
export function parseTime(value: string | null): number | null {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length > 3 || !parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;
    return parts.reduce((s, p) => s * 60 + Number(p), 0);
  }
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s?)?$/.exec(text);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

// "3m17s" for 197 (as kabbalahmedia writes it)
export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}h` : ''}${h || m ? `${m}m` : ''}${s % 60}s`;
}

// The link's sstart / send -> a clip; none, or not a valid part -> undefined
function clipOf(url: URL): Clip | undefined {
  const start = parseTime(url.searchParams.get('sstart'));
  const end = parseTime(url.searchParams.get('send'));
  if (!start && end === null) return undefined;
  if (end !== null && end <= (start ?? 0)) return undefined;
  return { start: start ?? 0, end };
}

// "https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo?c=…" or "5JBUHZoo" -> the lesson (with ?sstart=&send=: a clip
// of it); an http(s) link -> media; anything else -> null
export function parseSttInput(value: string): SttInput | null {
  const text = value.trim();
  if (!text) return null;
  const uid = parseUnitUid(text);
  if (uid) {
    let clip: Clip | undefined;
    try {
      clip = clipOf(new URL(text));
    } catch {
      // just the uid
    }
    return clip ? { kind: 'lesson', uid, clip } : { kind: 'lesson', uid };
  }
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? { kind: 'media', url: url.href } : null;
  } catch {
    return null;
  }
}

// The value kept in the page's address (?src=): the uid for a lesson (a clip: its link), the link for media
export function inputKey(input: SttInput): string {
  if (input.kind === 'media') return input.url;
  return input.clip ? lessonUrl(input.uid, input.clip) : input.uid;
}

// The lesson's page in kabbalahmedia (a clip: with its sstart / send)
export function lessonUrl(uid: string, clip?: Clip): string {
  const url = `https://kabbalahmedia.info/he/lessons/cu/${uid}`;
  if (!clip) return url;
  const q = new URLSearchParams({ sstart: formatTime(clip.start) });
  if (clip.end !== null) q.set('send', formatTime(clip.end));
  return `${url}?${q}`;
}

// The clip as ai-trns job fields (seconds); none -> {}
export function clipFields(clip?: Clip | null): Record<string, string> {
  if (!clip) return {};
  return clip.end === null ? { start: String(clip.start) } : { start: String(clip.start), end: String(clip.end) };
}
