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

// The model's transcript of the audio at `url` (its chunks) -> paragraphs with speakers, as chunks
// (speaker label, a time per word). A diarize job with paragraphs; takes a few minutes.
export async function speakerParagraphs(url: string, chunks: Chunk[], onJob?: (job: Job) => void): Promise<Chunk[]> {
  const srt = new File([chunksToSrt(chunks)], 'transcript.srt', { type: 'application/x-subrip' });
  const job = await waitJob(await postJob('/diarize/words', formOf({ url, srt, paragraphs: 'true' })), onJob);
  const { paragraphs } = (await (await jobResult(job.id, 'paragraphs')).json()) as { paragraphs: Paragraph[] };
  return paragraphs
    .map((p) => {
      const words = p.words.filter((w) => w.word.trim());
      return {
        start: p.start,
        end: p.end,
        text: words.map((w) => w.word.trim()).join(' '),
        speaker: p.label,
        times: words.map((w) => w.start),
      };
    })
    .filter((c) => c.text);
}
