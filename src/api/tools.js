import { AI_TRNS_API } from "../consts";
import { aiTrnsFetch, formOf, jobResult, postJob, responseFileName, waitJob } from "./aiTrns";

// Speakers, Doc diff and Text diff on ai-trns (moved there from stt-api): each request is a job
// (202 + polling), its result comes from /jobs/{id}/result, counts from the job's stats.

export { MAX_UPLOAD_SIZE } from "./aiTrns";

// POST a job form, wait for it -> [job, the result Response]
const runJob = async (path, fields, {onUploadProgress, format} = {}) => {
    const job = await waitJob(await postJob(path, formOf(fields), onUploadProgress));
    return [job, await jobResult(job.id, format)];
};

const speakersFields = (audio, srt, {samples, sampleNames, numSpeakers, minSpeakers, maxSpeakers} = {}) => ({
    audio, srt, samples,
    sample_names: sampleNames,
    num_speakers: numSpeakers,
    min_speakers: minSpeakers,
    max_speakers: maxSpeakers,
});

// -> {blob, fileName, stats: {speakers, named, mixed_cues, ...}}
export const diarizeSrt = async (audio, srt, options = {}) => {
    const [job, res] = await runJob("/diarize/srt", speakersFields(audio, srt, options), options);
    return {blob: await res.blob(), fileName: responseFileName(res, "speakers.srt"), stats: job.stats || {}};
};

// -> {words: [{word, start, end, speaker, cue}], stats}
export const diarizeWords = async (audio, srt, options = {}) => {
    const [, res] = await runJob("/diarize/words", speakersFields(audio, srt, options), options);
    return res.json();
};

const postJson = async (path, body) => {
    const res = await aiTrnsFetch(path, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res;
};

// words: the diarizeWords() result's words -> {blob, fileName}
export const wordsToSrt = async (words, {maxChars, maxLines, labels, pad} = {}) => {
    const res = await postJson("/diarize/words/srt", {words, max_chars: maxChars, max_lines: maxLines, labels, pad});
    return {blob: await res.blob(), fileName: responseFileName(res, "words.srt")};
};

// -> {blob, fileName, stats: {text_words, audio_words, removed_marked, removed_total}}
export const docdiffCompare = async (doc, audio, options = {}) => {
    const [job, res] = await runJob("/docdiff/compare", {doc, audio}, options);
    return {blob: await res.blob(), fileName: responseFileName(res, "marked.docx"), stats: job.stats || {}};
};

// text: string -> {removed, added, changed, stats}
export const tadiffCompare = async (audio, text, options = {}) => {
    const [, res] = await runJob("/tadiff/compare", {audio, text}, options);
    return res.json();
};

// textFile: plain text, timestampsFile: JSON [{word, start, end}] -> same as tadiffCompare (right away, no job)
export const tadiffCompareTimestamps = async (textFile, timestampsFile) => {
    const res = await aiTrnsFetch("/tadiff/compare-timestamps", {
        method: "POST", body: formOf({text: textFile, timestamps: timestampsFile}),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
};

// ai-trns /health (no token) -> {status, queued, workers}
export const health = async () => {
    const res = await fetch(new URL(`${AI_TRNS_API}/health`, window.location.href));
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
};
