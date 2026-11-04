import { REVIEW_SET } from '../consts';
import { getUser, kc } from '../api/UserManager';
import { addSegment, ConflictError, getReviewerResults, getSet, NotFoundError, type ReviewResult, type ReviewSegment, type ReviewSet } from '../api/review';
import { readDraft, resendDraft } from '../review/useReviewSaver';
import type { Reviewer } from '../components/review/SegmentReview';

// The compare page against בדיקת תמלול: the lesson's transcript is the one frozen in the shared set,
// so marks made here are the same review result the review page edits (and the report counts).

export interface LessonFiles {
  uid: string;
  title: string;
  audioFileId: string;
  videoFileId?: string;
  duration: number;
}

export interface ReviewLesson {
  set: ReviewSet;
  segment: ReviewSegment;
  reviewer: Reviewer;
  // my result so far (server or a newer draft from this browser)
  initial: ReviewResult | null;
}

// how often the set is re-read while the lesson is being transcribed
const PENDING_POLL_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The logged-in user; nobody: off to the login page.
function currentReviewer(): Promise<Reviewer> {
  return new Promise((resolve, reject) => {
    getUser((user: { id: string; display?: string; username?: string; email?: string } | null) => {
      if (user) return resolve({ id: user.id, name: user.display || user.username || user.email || '' });
      void kc.login({ redirectUri: window.location.href });
      reject(new Error('יש להתחבר'));
    });
  });
}

const findLesson = (set: ReviewSet, uid: string) => set.segments.find((s) => s.unit_uid === uid || s.id === uid);

// The lesson in the set -- added (and transcribed by the server) if it isn't there yet.
// onWait: called while the server is still transcribing it.
export async function loadReviewLesson(lesson: LessonFiles, onWait: () => void, cancelled: () => boolean): Promise<ReviewLesson> {
  const reviewer = await currentReviewer();
  let set = await getSet(REVIEW_SET);
  let segment = findLesson(set, lesson.uid);
  // a lesson whose transcription failed is added again: that is how it is retried
  if (!segment || segment.status === 'failed') {
    await addSegment(REVIEW_SET, {
      unit_uid: lesson.uid,
      title: lesson.title,
      audio_file_id: lesson.audioFileId,
      video_file_id: lesson.videoFileId,
      duration: lesson.duration,
      reviewer: reviewer.id,
      reviewer_name: reviewer.name,
    }).catch((e) => {
      // someone added it meanwhile
      if (!(e instanceof ConflictError)) throw e;
    });
    set = await getSet(REVIEW_SET);
    segment = findLesson(set, lesson.uid);
  }
  while (segment?.status === 'pending') {
    onWait();
    await sleep(PENDING_POLL_MS);
    if (cancelled()) throw new Error('בוטל');
    set = await getSet(REVIEW_SET);
    segment = findLesson(set, lesson.uid);
  }
  if (!segment) throw new Error('השיעור לא נמצא ברשימת בדיקת תמלול');
  if (segment.status === 'failed') throw new Error(`התמלול נכשל: ${segment.error ?? ''}`);

  const saved = await getReviewerResults(REVIEW_SET, reviewer.id).catch((e) => {
    if (e instanceof NotFoundError) return [];
    throw e;
  });
  let initial = saved.find((r) => r.segment_id === segment.id) ?? null;
  // work the server never got (closed tab, network down) is in this browser: use it and send it again
  const draft = readDraft({ set_id: REVIEW_SET, reviewer: reviewer.id, segment_id: segment.id });
  if (draft && (!initial || draft.updated_at > initial.updated_at)) {
    initial = draft;
    resendDraft(draft).catch(() => {});
  }
  return { set, segment, reviewer, initial };
}
