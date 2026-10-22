export const MQTT_URL = import.meta.env.REACT_APP_MQTT_URL;
export const WEB_URL = import.meta.env.REACT_APP_WEB_URL;
export const AI_BACKEND = import.meta.env.REACT_APP_AI_BACKEND;
export const EXEC_API = import.meta.env.REACT_APP_EXEC_API;
export const STT_API = import.meta.env.REACT_APP_STT_API;
// ai-trns REST API: transcription jobs (/jobs) and STT review (/review/*)
export const AI_TRNS_API = import.meta.env.REACT_APP_AI_TRNS_API;
export const STT_MODEL = import.meta.env.REACT_APP_STT_MODEL;
// stt-api's transcription job (the older service), offered on the compare page next to ai-trns
export const STT_URL = import.meta.env.REACT_APP_STT_URL || 'https://ai-tools.kab.info/stt-api/stt/transcribe';
export const ALIGN_URL = import.meta.env.REACT_APP_ALIGN_URL;
// STT review: "local" -- see api/review.ts; otherwise ai-trns.
export const REVIEW_API = import.meta.env.REACT_APP_REVIEW_API;
// Live transcription (תמלול חי): the broadcast's HLS stream
export const LIVE_STREAM_URL = import.meta.env.REACT_APP_LIVE_STREAM_URL;
// Live text into a Google Doc from the browser, as the user: an OAuth client id (Google Cloud, web app,
// this origin allowed, Docs API on); empty = off
export const GOOGLE_CLIENT_ID = import.meta.env.REACT_APP_GOOGLE_CLIENT_ID;
// Google's picker for choosing an existing doc: an API key (Picker API, restricted to this site); empty = new docs only
export const GOOGLE_API_KEY = import.meta.env.REACT_APP_GOOGLE_API_KEY;
// All reviewers share one set (the API routes still take a set id).
export const REVIEW_SET = 'main';
// Defaults so a build with an older .env still starts: new Keycloak() throws without them.
export const KEYCLOAK_URL = import.meta.env.REACT_APP_KEYCLOAK_URL || 'https://accounts.kab.info/auth';
export const KEYCLOAK_REALM = import.meta.env.REACT_APP_KEYCLOAK_REALM || 'main';
export const KEYCLOAK_CLIENT_ID = import.meta.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'ai-tools';

export const language_options = [
    { key: 'he', value: 'heb', flag: 'il', text: 'Hebrew' },
    { key: 'ru', value: 'rus', flag: 'ru', text: 'Russian' },
    { key: 'en', value: 'eng', flag: 'us', text: 'English' },
    { key: 'es', value: 'spa', flag: 'es', text: 'Spanish' },
    { key: 'fr', value: 'fre', flag: 'fr', text: 'French' },
    { key: 'it', value: 'ita', flag: 'it', text: 'Italian' },
    { key: 'de', value: 'ger', flag: 'de', text: 'German' },
    { key: 'tr', value: 'trk', flag: 'tr', text: 'Turkish' },
    { key: 'pt', value: 'por', flag: 'pt', text: 'Portuguese' },
    { key: 'bg', value: 'bul', flag: 'bg', text: 'Bulgarian' },
    { key: 'ka', value: 'geo', flag: 'ge', text: 'Georgian' },
    { key: 'ro', value: 'ron', flag: 'ro', text: 'Romanian' },
    { key: 'hu', value: 'hun', flag: 'hu', text: 'Hungarian' },
    { key: 'sv', value: 'swe', flag: 'se', text: 'Swedish' },
    { key: 'lt', value: 'lit', flag: 'lt', text: 'Lithuanian' },
    { key: 'hr', value: 'hrv', flag: 'hr', text: 'Croatian' },
    { key: 'ja', value: 'jpn', flag: 'jp', text: 'Japanese' },
    { key: 'sl', value: 'slv', flag: 'si', text: 'Slovenian' },
    { key: 'pl', value: 'pol', flag: 'pl', text: 'Polish' },
    { key: 'no', value: 'nor', flag: 'no', text: 'Norwegian' },
    { key: 'lv', value: 'lav', flag: 'lv', text: 'Latvian' },
    { key: 'ua', value: 'ukr', flag: 'ua', text: 'Ukrainian' },
    { key: 'nl', value: 'dut', flag: 'nl', text: 'Dutch' },
    { key: 'cn', value: 'chn', flag: 'cn', text: 'Chinese' },
    { key: 'et', value: 'amh', flag: 'et', text: 'Amharic' },
    { key: 'in', value: 'hin', flag: 'in', text: 'Hindi' },
    { key: 'ir', value: 'per', flag: 'ir', text: 'Persian' },
];
