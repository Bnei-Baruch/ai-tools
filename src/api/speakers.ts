import { chunksToSrt, type Chunk } from './transcribe';
import { formOf, jobResult, postJob, waitJob, type Job } from './aiTrns';

// One paragraph of an ai-trns diarize job (?format=paragraphs): a new one at every speaker change, the
// Rav's speech split by the paragraphing model. label: רב / קריין / תלמיד (ai-trns labels.py).
interface Paragraph {
  speaker: string | null;
  label: string | null;
  start: number;
  end: number;
  text: string;
  words: { word: string; start: number; end: number }[];
}

// The lesson's source text, so turns reading it are labeled the reader's (קריין): ai-trns finds the lesson's
// sources itself by its uid (its linked sources and LIKUTIM); which ones it used: sourcesUsed(job) once it's done.
function lessonSourceFields(uid?: string | null): Record<string, unknown> {
  return uid ? { uid } : {};
}

// The sources a finished diarize job used (stats.sources, `used`): their names; null if the job doesn't say
export function sourcesUsed(job: Job): string[] | null {
  const sources = job.stats?.sources;
  if (!Array.isArray(sources)) return null;
  return sources.filter((s) => s && s.used).map((s) => String(s.name ?? s.id));
}

// Starts a diarize job with paragraphs for the model's transcript (its chunks) of the audio at `url`.
// uid: the kabbalahmedia lesson, for its source (see lessonSourceFields); none -> the reader is told by voice only.
export async function startSpeakerParagraphs(url: string, chunks: Chunk[], uid?: string | null): Promise<{ job: Job }> {
  const srt = new File([chunksToSrt(chunks)], 'transcript.srt', { type: 'application/x-subrip' });
  const job = await postJob('/diarize/words', formOf({ url, srt, paragraphs: 'true', ...lessonSourceFields(uid) }));
  return { job };
}

// A finished diarize job's paragraphs, as chunks (speaker label, start / end of each word)
export async function paragraphsOf(jobId: string): Promise<Chunk[]> {
  const { paragraphs } = (await (await jobResult(jobId, 'paragraphs')).json()) as { paragraphs: Paragraph[] };
  return paragraphs
    .map((p) => {
      const words = p.words.filter((w) => w.word.trim());
      return {
        start: p.start,
        end: p.end,
        text: words.map((w) => w.word.trim()).join(' '),
        speaker: p.label,
        times: words.map((w) => w.start),
        ends: words.map((w) => w.end),
      };
    })
    .filter((c) => c.text);
}

// The model's transcript of the audio at `url` (its chunks) -> paragraphs with speakers, as chunks
// (speaker label, a time per word). A diarize job with paragraphs; takes a few minutes.
export async function speakerParagraphs(url: string, chunks: Chunk[], uid?: string | null,
                                        onJob?: (job: Job) => void): Promise<Chunk[]> {
  const { job } = await startSpeakerParagraphs(url, chunks, uid);
  await waitJob(job, onJob);
  return paragraphsOf(job.id);
}
