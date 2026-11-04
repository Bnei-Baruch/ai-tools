import React, { Fragment, useState } from 'react';
import LoginPage from '../components/LoginPage';
import MediaSource from '../components/transcription/MediaSource';
import TranscriptionResults from '../components/transcription/TranscriptionResults';
import TranscriptionSettings from '../components/transcription/TranscriptionSettings';
import { formOf, jobResult, postJob, waitJob } from '../api/aiTrns';
import { saveBlob } from '../utils';
import { Button, Card, Message } from '../components/ui';

const STAGES = {
    queued: 'Waiting in the queue',
    downloading: 'Fetching the media',
    converting: 'Converting the audio',
    loading_model: 'Loading the model',
    queued_upstream: 'Waiting for the transcription service',
};

// The status line for a job state
const statusText = (job) => {
    if (job.status === 'queued') {
        return job.queue_position ? `${STAGES.queued} (#${job.queue_position})...` : `${STAGES.queued}...`;
    }
    return `${STAGES[job.stage] || 'Transcription in progress'}...`;
};

// "lesson.mp4" -> "lesson"; a link -> its last path segment
const baseName = (file, link) => {
    const name = file ? file.name : decodeURIComponent(new URL(link).pathname.split('/').filter(Boolean).pop() || 'output');
    return name.replace(/\.[^.]+$/, '') || 'output';
};

// An ai-trns transcription job (POST /jobs) for an uploaded file or a link; the results are the job's formats.
const Transcription = () => {
    const [user, setUser] = useState(null);
    const [file, setFile] = useState(null);
    const [link, setLink] = useState('');
    const [language, setLanguage] = useState('he');
    const [outputFormats, setOutputFormats] = useState(['srt']);
    const [busy, setBusy] = useState(false);
    const [percent, setPercent] = useState(0);
    const [logText, setLogText] = useState('');
    const [error, setError] = useState(null);
    // the finished job: {id, formats, name, file, url}
    const [done, setDone] = useState(null);

    const url = link.trim();
    const canStart = !busy && (file || url) && outputFormats.length > 0;

    const chooseFile = (f) => {
        setFile(f);
        setLink('');
    };

    const typeLink = (value) => {
        setLink(value);
        setFile(null);
    };

    const start = async () => {
        setBusy(true);
        setError(null);
        setDone(null);
        setPercent(0);
        const formats = [...outputFormats];
        try {
            const body = formOf({
                file, url: file ? '' : url, lang: language, format: formats.join(','),
                // RTL marks in Hebrew subtitles, as the old exec-api page did
                fix_rtl: language === 'he' ? 'true' : '',
            });
            setLogText(file ? 'Uploading...' : 'Starting...');
            let job = await postJob('/jobs', body, file ? (p) => {
                setPercent(p);
                setLogText(p < 100 ? 'Uploading...' : 'Starting...');
            } : undefined);
            setPercent(0);
            job = await waitJob(job, (j) => {
                setLogText(statusText(j));
                setPercent(Math.round((j.progress || 0) * 100));
            });
            setDone({ id: job.id, formats, name: baseName(file, url), file, url: file ? null : url });
            setLogText('Your files are ready!');
        } catch (err) {
            setError(err.message);
            setLogText('');
        } finally {
            setBusy(false);
            setPercent(0);
        }
    };

    const download = async (format) => {
        try {
            const res = await jobResult(done.id, format);
            saveBlob(await res.blob(), `${done.name}.${format}`);
        } catch (err) {
            setError(`Download failed: ${err.message}`);
        }
    };

    const opt = (
        <Card className="text-base">
            <MediaSource file={file} onFileChange={chooseFile} link={link} onLinkChange={typeLink} disabled={busy} />

            <div className="mt-5 h-6 overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-blue-600 text-xs leading-6 font-semibold text-white transition-all"
                     style={{ width: `${percent}%` }}>
                    {percent > 0 && `${percent}%`}
                </div>
            </div>
            <pre className="mt-2.5 font-mono whitespace-pre-wrap">{logText}</pre>
            {error && <Message tone="error" className="mt-2 text-left">{error}</Message>}

            {done && (
                <TranscriptionResults formats={done.formats} onDownload={download} jobId={done.id}
                                      audioFile={done.file} url={done.url} />
            )}

            <TranscriptionSettings
                language={language}
                outputFormats={outputFormats}
                onLanguageChange={setLanguage}
                onFormatChange={setOutputFormats}
            />

            <Button variant='primary' size='xl' className='mt-6' disabled={!canStart} loading={busy} onClick={start}>
                Start Transcription
            </Button>
        </Card>
    );

    return (
        <Fragment>
            <LoginPage user={user} enter={opt} checkPermission={setUser} />
        </Fragment>
    );
};

export default Transcription;
