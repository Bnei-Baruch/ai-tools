// What the תמלול page is given: a kabbalahmedia lesson (its link or uid) or a direct media link.
import { parseUnitUid } from '../api/kmedia.ts';

export type SttInput = { kind: 'lesson'; uid: string } | { kind: 'media'; url: string };

// "https://kabbalahmedia.info/he/lessons/cu/5JBUHZoo?c=…" or "5JBUHZoo" -> the lesson; an http(s) link -> media;
// anything else -> null
export function parseSttInput(value: string): SttInput | null {
  const text = value.trim();
  if (!text) return null;
  const uid = parseUnitUid(text);
  if (uid) return { kind: 'lesson', uid };
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? { kind: 'media', url: url.href } : null;
  } catch {
    return null;
  }
}

// The value kept in the page's address (?src=): the uid for a lesson, the link for media
export const inputKey = (input: SttInput) => (input.kind === 'lesson' ? input.uid : input.url);
