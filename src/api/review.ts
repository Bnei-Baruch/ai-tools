import { REVIEW_API, STT_API } from '../consts';
import { kc } from './UserManager';
import type { Chunk } from './transcribe';

// Formats: TASK-stt-review.md, "1. Данные". Server side: ../stt-api, /review/*.

export interface ReviewSegment {
  id: string;
  title: string;
  // only in sets prepared in advance (reading / explanation / ...); lessons added by link have none
  category?: string;
  media_url: string;
  video_url?: string;
  // seconds within the media file; chunk times are absolute as well.
  // A lesson added by link is reviewed whole: 0 .. its duration.
  start: number;
  end: number;
  // empty until the model has run (status "pending")
  chunks: Chunk[];
  baseline_chunks?: Chunk[];
  // segments are added by reviewers from a kabbalahmedia link and transcribed on the server;
  // no status = prepared in advance, ready
  status?: SegmentStatus;
  error?: string;
  unit_uid?: string;
  added_by?: string;
  added_by_name?: string;
}

export type SegmentStatus = 'pending' | 'ready' | 'failed';

// POST /review/sets/{set_id}/segments: the server builds the CDN URLs from the file ids and adds the
// lesson to the set as "pending"; the browser then transcribes it (see uploadTranscript).
export interface NewSegment {
  unit_uid: string;
  title: string;
  audio_file_id: string;
  video_file_id?: string;
  // the lesson's duration from kabbalahmedia, for the list until the transcript is there
  duration: number;
  reviewer: string;
  reviewer_name: string;
}

export interface ReviewSet {
  id: string;
  model: string;
  baseline_model?: string;
  // shared by all reviewers, who pick segments themselves (and add new ones)
  segments: ReviewSegment[];
}

export type ErrorCategory = 'A' | 'B' | 'C';

export interface ChunkReview {
  index: number;
  corrected: string;
  category: ErrorCategory | null;
  comment?: string;
}

export type ReviewStatus = 'in_progress' | 'done';

export interface ReviewResult {
  set_id: string;
  segment_id: string;
  model: string;
  reviewer: string;
  reviewer_name: string;
  status: ReviewStatus;
  // only the chunks the reviewer touched
  chunks: ChunkReview[];
  // playhead, to resume where they stopped
  position: number;
  active_seconds: number;
  updated_at: string;
}

export interface AllResults {
  set: ReviewSet;
  results: ReviewResult[];
}

// REACT_APP_REVIEW_API=local: the set is public/review/{set_id}.json, results stay in this browser.
// For trying the screens out without stt-api; never for the real review.
export const REVIEW_LOCAL = REVIEW_API === 'local';
const API = REVIEW_API || STT_API;

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (kc.token) headers.set('Authorization', `Bearer ${kc.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new Error('השרת אינו זמין');
  }
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const parsed = JSON.parse(text).detail;
      detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      // not JSON, keep raw text
    }
    const message = `${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`;
    throw res.status === 409 ? new ConflictError(message) : new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const reviewerPath = (setId: string, reviewer: string) =>
  `/review/sets/${encodeURIComponent(setId)}/reviewers/${encodeURIComponent(reviewer)}`;

// --- local mode

async function localSet(setId: string): Promise<ReviewSet> {
  const res = await fetch(`${import.meta.env.BASE_URL}review/${encodeURIComponent(setId)}.json`);
  if (!res.ok) throw new NotFoundError(setId);
  const set: ReviewSet = await res.json();
  const deleted = new Set(localDeleted(setId));
  return { ...set, segments: [...set.segments, ...localAdded(setId)].filter((s) => !deleted.has(s.id)) };
}

const addedKey = (setId: string) => `review-local-segments:${setId}`;
const deletedKey = (setId: string) => `review-local-deleted:${setId}`;

function localDeleted(setId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(deletedKey(setId)) ?? '[]');
  } catch {
    return [];
  }
}

function localAdded(setId: string): ReviewSegment[] {
  try {
    return JSON.parse(localStorage.getItem(addedKey(setId)) ?? '[]');
  } catch {
    return [];
  }
}

function saveLocalAdded(setId: string, segment: ReviewSegment) {
  const others = localAdded(setId).filter((s) => s.id !== segment.id);
  localStorage.setItem(addedKey(setId), JSON.stringify([...others, segment]));
}

async function localAddSegment(setId: string, req: NewSegment): Promise<ReviewSegment> {
  const segment: ReviewSegment = {
    id: req.unit_uid,
    title: req.title,
    media_url: `https://cdn.kabbalahmedia.info/${req.audio_file_id}`,
    video_url: req.video_file_id && `https://cdn.kabbalahmedia.info/${req.video_file_id}`,
    start: 0,
    end: req.duration,
    chunks: [],
    status: 'pending',
    unit_uid: req.unit_uid,
    added_by: req.reviewer,
    added_by_name: req.reviewer_name,
  };
  saveLocalAdded(setId, segment);
  // re-adding a deleted lesson brings it back
  localStorage.setItem(deletedKey(setId), JSON.stringify(localDeleted(setId).filter((id) => id !== segment.id)));
  return segment;
}

function localUploadTranscript(setId: string, segmentId: string, body: TranscriptUpload): ReviewSegment {
  const segment = localAdded(setId).find((s) => s.id === segmentId);
  if (!segment) throw new NotFoundError(segmentId);
  const updated: ReviewSegment = body.chunks
    ? { ...segment, chunks: body.chunks, end: Math.max(segment.end, body.chunks.at(-1)?.end ?? 0), status: 'ready', error: undefined }
    : { ...segment, status: 'failed', error: body.error };
  saveLocalAdded(setId, updated);
  return updated;
}

const LOCAL_PREFIX = 'review-local:';

function localResults(setId: string): ReviewResult[] {
  const results: ReviewResult[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`${LOCAL_PREFIX}${setId}:`)) continue;
    try {
      results.push(JSON.parse(localStorage.getItem(key) ?? ''));
    } catch {
      // skip a broken entry
    }
  }
  return results;
}

// --- API

// All segments, without baseline_* (reviewers must not see the other model).
export async function getSet(setId: string): Promise<ReviewSet> {
  if (!REVIEW_LOCAL) return call(`/review/sets/${encodeURIComponent(setId)}`);
  const set = await localSet(setId);
  return { id: set.id, model: set.model, segments: set.segments.map(({ baseline_chunks: _, ...s }) => s) };
}

export async function getReviewerResults(setId: string, reviewer: string): Promise<ReviewResult[]> {
  if (!REVIEW_LOCAL) return call(`${reviewerPath(setId, reviewer)}/results`);
  return localResults(setId).filter((r) => r.reviewer === reviewer);
}

// Saves the whole segment result (idempotent). keepalive: survives the tab being closed.
export async function putResult(result: ReviewResult, { keepalive = false } = {}): Promise<void> {
  const { set_id, reviewer, segment_id } = result;
  if (REVIEW_LOCAL) {
    localStorage.setItem(`${LOCAL_PREFIX}${set_id}:${segment_id}:${reviewer}`, JSON.stringify(result));
    return;
  }
  await call(`${reviewerPath(set_id, reviewer)}/segments/${encodeURIComponent(segment_id)}`, {
    method: 'PUT',
    body: JSON.stringify(result),
    keepalive,
  });
}

// The model's transcript of the whole lesson (made in the browser: the server can't reach the STT service),
// or the error if transcription failed. model: the set's model, the one STT_URL is expected to serve.
export interface TranscriptUpload {
  reviewer: string;
  model: string;
  chunks?: Chunk[];
  error?: string;
}

// -> the segment, "ready" (or "failed"). 409: it is already ready -- someone else transcribed it first.
export async function uploadTranscript(setId: string, segmentId: string, body: TranscriptUpload): Promise<ReviewSegment> {
  if (REVIEW_LOCAL) return localUploadTranscript(setId, segmentId, body);
  return call(`/review/sets/${encodeURIComponent(setId)}/segments/${encodeURIComponent(segmentId)}/transcript`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// -> the new segment, status "pending": the client then transcribes it and calls uploadTranscript().
export async function addSegment(setId: string, req: NewSegment): Promise<ReviewSegment> {
  if (REVIEW_LOCAL) return localAddSegment(setId, req);
  return call(`/review/sets/${encodeURIComponent(setId)}/segments`, { method: 'POST', body: JSON.stringify(req) });
}

// Removes a lesson from the shared list. The server only hides it (deleted_by / deleted_at),
// so the lesson and the reviews already made of it can be restored by hand.
export async function deleteSegment(setId: string, segmentId: string, reviewer: string): Promise<void> {
  if (REVIEW_LOCAL) {
    localStorage.setItem(deletedKey(setId), JSON.stringify([...localDeleted(setId), segmentId]));
    return;
  }
  const query = new URLSearchParams({ reviewer });
  await call(`/review/sets/${encodeURIComponent(setId)}/segments/${encodeURIComponent(segmentId)}?${query}`, { method: 'DELETE' });
}

// For the report: the full set (with baseline_*) and every reviewer's results.
export async function getAllResults(setId: string): Promise<AllResults> {
  if (!REVIEW_LOCAL) return call(`/review/sets/${encodeURIComponent(setId)}/results`);
  return { set: await localSet(setId), results: localResults(setId) };
}
