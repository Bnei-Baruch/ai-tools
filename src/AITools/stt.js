import {STT_API} from "./consts";
import {kc} from "./UserManager";

// Cloudflare rejects request bodies above 100 MB.
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

const STATUS_MESSAGES = {
    0: "STT API is unreachable",
    413: "File is too large: Cloudflare accepts up to 100 MB per request",
    524: "The file is too long for synchronous processing (Cloudflare timed out after ~100 s), try a shorter one",
};

const errorMessage = async (xhr) => {
    if (STATUS_MESSAGES[xhr.status]) return STATUS_MESSAGES[xhr.status];
    const text = await xhr.response?.text().catch(() => "") ?? "";
    try {
        // 400 has a meaningful detail, 500 is always "Internal error"
        const {detail} = JSON.parse(text);
        return `${xhr.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
    } catch {
        return `${xhr.status} ${xhr.statusText}`;
    }
};

// XHR rather than fetch: only XHR reports upload progress.
// body: FormData (Content-Type is set by the browser) or a plain object sent as JSON.
const request = (path, {method = "POST", body, onUploadProgress} = {}) =>
    new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `${STT_API}${path}`);
        xhr.responseType = "blob";
        if (kc.token) xhr.setRequestHeader("Authorization", `Bearer ${kc.token}`);
        if (onUploadProgress) {
            xhr.upload.onprogress = (e) => e.lengthComputable && onUploadProgress(Math.round(e.loaded / e.total * 100));
        }
        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
            else reject(new Error(await errorMessage(xhr)));
        };
        xhr.onerror = () => reject(new Error(STATUS_MESSAGES[0]));
        if (body instanceof FormData || body === undefined) {
            xhr.send(body);
        } else {
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(body));
        }
    });

const json = async (xhr) => JSON.parse(await xhr.response.text());

const fileName = (xhr, fallback) => {
    const header = xhr.getResponseHeader("Content-Disposition") || "";
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8) return decodeURIComponent(utf8[1]);
    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain ? plain[1] : fallback;
};

// "X-Diarize-Split-Cues: 3" -> {split_cues: 3}
const headerStats = (xhr, prefix) =>
    Object.fromEntries(xhr.getAllResponseHeaders().trim().split(/\r?\n/)
        .map((line) => line.split(/:\s*/, 2))
        .filter(([name]) => name.toLowerCase().startsWith(prefix))
        .map(([name, value]) => [name.slice(prefix.length).toLowerCase().replace(/-/g, "_"), Number(value)]));

const form = (fields) => {
    const body = new FormData();
    Object.entries(fields).forEach(([name, value]) => {
        [].concat(value ?? []).filter((v) => v !== "").forEach((v) => body.append(name, v));
    });
    return body;
};

const speakersForm = (audio, srt, {samples, sampleNames, numSpeakers, minSpeakers, maxSpeakers} = {}) =>
    form({
        audio, srt, samples,
        sample_names: sampleNames,
        num_speakers: numSpeakers,
        min_speakers: minSpeakers,
        max_speakers: maxSpeakers,
    });

// -> {blob, fileName, stats: {speakers, named, split_cues}}
export const diarizeSrt = async (audio, srt, options = {}) => {
    const xhr = await request("/diarize/srt", {body: speakersForm(audio, srt, options), ...options});
    return {blob: xhr.response, fileName: fileName(xhr, "speakers.srt"), stats: headerStats(xhr, "x-diarize-")};
};

// -> {words: [{word, start, end, speaker, cue}], stats}
export const diarizeWords = async (audio, srt, options = {}) =>
    json(await request("/diarize/words", {body: speakersForm(audio, srt, options), ...options}));

// words: the diarizeWords() result's words -> {blob, fileName}
export const wordsToSrt = async (words, {maxChars, maxLines, labels, pad} = {}) => {
    const xhr = await request("/diarize/words/srt", {
        body: {words, max_chars: maxChars, max_lines: maxLines, labels, pad},
    });
    return {blob: xhr.response, fileName: fileName(xhr, "words.srt")};
};

// -> {blob, fileName, stats: {text_words, audio_words, removed_marked, removed_total}}
export const docdiffCompare = async (doc, audio, options = {}) => {
    const xhr = await request("/docdiff/compare", {body: form({doc, audio}), ...options});
    return {blob: xhr.response, fileName: fileName(xhr, "marked.docx"), stats: headerStats(xhr, "x-docdiff-")};
};

// text: string -> {removed, added, changed, stats}
export const tadiffCompare = async (audio, text, options = {}) =>
    json(await request("/tadiff/compare", {body: form({audio, text}), ...options}));

// textFile: plain text, timestampsFile: JSON [{word, start, end}] -> same as tadiffCompare
export const tadiffCompareTimestamps = async (textFile, timestampsFile, options = {}) =>
    json(await request("/tadiff/compare-timestamps", {body: form({text: textFile, timestamps: timestampsFile}), ...options}));

export const sttHealth = async () => json(await request("/health", {method: "GET"}));
