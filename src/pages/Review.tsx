import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { REVIEW_SET } from '../consts';
import { getUser, kc } from '../api/UserManager';
import { deleteSegment, getAllResults, getReviewerResults, getSet, NotFoundError, REVIEW_LOCAL, type ReviewResult, type ReviewSegment, type ReviewSet } from '../api/review';
import { readDraft, resendDraft } from '../review/useReviewSaver';
import useTranscriber from '../review/useTranscriber';
import ErrorAlert from '../components/stt/ErrorAlert';
import AddSegment from '../components/review/AddSegment';
import Instructions from '../components/review/Instructions';
import ReviewList from '../components/review/ReviewList';
import ReviewReport from '../components/review/ReviewReport';
import SegmentReview, { type Reviewer } from '../components/review/SegmentReview';
import '../components/review/review.css';

const INTRO_SEEN_KEY = 'review-intro-seen';
// how often the list re-reads the set while a new segment is being transcribed
const PENDING_POLL_MS = 10_000;

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

// /review -> the current set; /review/{set}/results -> report (no login); /review/{set}/... -> reviewer.
export default function Review() {
  return (
    <>
      {REVIEW_LOCAL && <div className="alert alert--warn review-local">מצב מקומי: התוצאות נשמרות רק בדפדפן הזה.</div>}
      <Routes>
        <Route index element={<Navigate to={REVIEW_SET} replace />} />
        <Route path=':setId/results' element={<ReviewReport />} />
        <Route path=':setId/*' element={<ReviewerSession />} />
      </Routes>
    </>
  );
}

function useReviewer(): Reviewer | null | undefined {
  const [reviewer, setReviewer] = useState<Reviewer | null | undefined>(undefined);
  useEffect(() => {
    getUser((user: { id: string; display?: string; username?: string; email?: string } | null) =>
      setReviewer(user && { id: user.id, name: user.display || user.username || user.email || '' }));
  }, []);
  return reviewer;
}

function ReviewerSession() {
  const { setId = '' } = useParams();
  const reviewer = useReviewer();

  if (reviewer === undefined) return <div className="card"><div className="progress" /></div>;
  if (reviewer === null) {
    return (
      <div className="card review-center">
        <h1>בדיקת תמלול</h1>
        <p className="muted">יש להתחבר כדי להתחיל.</p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => kc.login({ redirectUri: window.location.href })}>
          כניסה
        </button>
      </div>
    );
  }
  return <ReviewerScreens setId={setId} reviewer={reviewer} />;
}

function ReviewerScreens({ setId, reviewer }: { setId: string; reviewer: Reviewer }) {
  const navigate = useNavigate();
  const [set, setSet] = useState<ReviewSet | null>(null);
  const [results, setResults] = useState<Record<string, ReviewResult>>({});
  const [othersDone, setOthersDone] = useState<Record<string, number>>({});
  // segment id -> how many other reviewers have saved anything for it (done or not)
  const [othersStarted, setOthersStarted] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const replaceSegment = useCallback((segment: ReviewSegment) => setSet((prev) => prev && {
    ...prev, segments: [...prev.segments.filter((s) => s.id !== segment.id), segment],
  }), []);
  const reloadSet = useCallback(() => getSet(setId).then(setSet, () => {}), [setId]);
  const transcriber = useTranscriber(setId, reviewer.id, replaceSegment, reloadSet);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await getSet(setId);
      const saved = await getReviewerResults(setId, reviewer.id).catch((e) => {
        if (e instanceof NotFoundError) return [];
        throw e;
      });
      const byId: Record<string, ReviewResult> = Object.fromEntries(saved.map((r) => [r.segment_id, r]));
      // Work the server never got (closed tab, network down) is in the browser: use it and send it again.
      loaded.segments.forEach((s) => {
        const draft = readDraft({ set_id: setId, reviewer: reviewer.id, segment_id: s.id });
        if (draft && (!byId[s.id] || draft.updated_at > byId[s.id].updated_at)) {
          byId[s.id] = draft;
          resendDraft(draft).catch(() => {});
        }
      });
      if (cancelled) return;
      setResults(byId);
      setSet(loaded);
      if (!storage.get(INTRO_SEEN_KEY)) setHelp(true);
    })().catch((e) => !cancelled && setError(e instanceof NotFoundError ? `הסט ${setId} לא נמצא` : e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [setId, reviewer.id]);

  // On the list: segments others added, who finished what (so reviewers spread over the set),
  // and segments still being transcribed. Re-read on every return to the list, and polled while pending.
  const { pathname } = useLocation();
  const onList = pathname.replace(/\/$/, '').endsWith(`/review/${setId}`);
  const pending = set?.segments.some((s) => s.status === 'pending') ?? false;
  useEffect(() => {
    if (!onList) return;
    const refresh = () => {
      getSet(setId).then(setSet, () => {});
      getAllResults(setId).then(({ results: all }) => {
        const count = (rs: ReviewResult[]) => {
          const counts: Record<string, number> = {};
          rs.forEach((r) => { counts[r.segment_id] = (counts[r.segment_id] ?? 0) + 1; });
          return counts;
        };
        const others = all.filter((r) => r.reviewer !== reviewer.id);
        setOthersDone(count(others.filter((r) => r.status === 'done')));
        setOthersStarted(count(others));
      }, () => {}); // only a hint: the list works without it
    };
    refresh();
    if (!pending) return;
    const id = setInterval(refresh, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [onList, pending, setId, reviewer.id]);

  const closeHelp = useCallback(() => {
    storage.set(INTRO_SEEN_KEY, '1');
    setHelp(false);
  }, []);

  const onChange = useCallback((r: ReviewResult) => setResults((prev) => ({ ...prev, [r.segment_id]: r })), []);

  async function remove(segment: ReviewSegment) {
    const others = othersStarted[segment.id] ?? 0;
    const mine = results[segment.id] ? 1 : 0;
    const warning = others + mine
      ? `\n\n${others + mine} בודקים כבר עבדו על השיעור הזה. העבודה שלהם לא תיכלל בדוח.`
      : '';
    if (!window.confirm(`למחוק את „${segment.title}“ מהרשימה?${warning}`)) return;
    try {
      await deleteSegment(setId, segment.id, reviewer.id);
      setSet((prev) => prev && { ...prev, segments: prev.segments.filter((s) => s.id !== segment.id) });
    } catch (e) {
      window.alert(`המחיקה נכשלה: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (error) return <div className="card"><ErrorAlert error={error} /></div>;
  if (set === null) return <div className="card"><div className="progress" /></div>;

  const base = `/review/${encodeURIComponent(setId)}`;
  const open = (segmentId: string) => navigate(`${base}/${encodeURIComponent(segmentId)}`);

  return (
    <>
      <Routes>
        <Route
          index
          element={(
            <ReviewList
              set={set}
              results={results}
              othersDone={othersDone}
              userName={reviewer.name}
              onOpen={open}
              onAdd={() => navigate(`${base}/new`)}
              onDelete={remove}
              transcribing={transcriber.running}
              onTranscribe={(segment) => transcriber.run(segment, set.model)}
              onHelp={() => setHelp(true)}
            />
          )}
        />
        <Route
          path='new'
          element={(
            <AddSegment
              set={set}
              reviewer={reviewer}
              onAdded={(segment) => {
                replaceSegment(segment);
                void transcriber.run(segment, set.model);
                navigate(base);
              }}
              onCancel={() => navigate(base)}
            />
          )}
        />
        <Route
          path=':segmentId'
          element={(
            <SegmentScreen
              set={set}
              results={results}
              reviewer={reviewer}
              keysEnabled={!help}
              onChange={onChange}
              onBack={() => navigate(base)}
              onHelp={() => setHelp(true)}
            />
          )}
        />
      </Routes>
      {help && <Instructions onClose={closeHelp} />}
    </>
  );
}

interface SegmentScreenProps {
  set: ReviewSet;
  results: Record<string, ReviewResult>;
  reviewer: Reviewer;
  keysEnabled: boolean;
  onChange: (r: ReviewResult) => void;
  onBack: () => void;
  onHelp: () => void;
}

function SegmentScreen({ set, results, onBack, ...props }: SegmentScreenProps) {
  const { segmentId } = useParams();
  const segment = set.segments.find((s) => s.id === segmentId);
  // still being transcribed (or failed): nothing to review yet
  if (!segment || segment.status === 'pending' || segment.status === 'failed') return <Navigate to='..' replace />;

  return (
    <SegmentReview
      key={segment.id}
      set={set}
      segment={segment}
      // only read on mount: the segment's own state lives in SegmentReview
      initial={results[segment.id] ?? null}
      onBack={onBack}
      // back to the list: the reviewer picks the next segment
      onFinish={onBack}
      {...props}
    />
  );
}
