import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { diarizeSrt } from '../api/stt';
import { fetchExecFile } from '../api/exec';
import { saveBlob } from '../utils';
import useApiCall from '../hooks/useApiCall';
import FileField from '../components/form/FileField';
import SubmitButton from '../components/form/SubmitButton';
import ErrorMessage from '../components/form/ErrorMessage';
import Stats from '../components/form/Stats';
import VoiceSamples, { baseName } from '../components/speakers/VoiceSamples';
import SpeakerHints from '../components/speakers/SpeakerHints';
import { Button, Card, Message, Page, PageHeader } from '../components/ui';

const Speakers = () => {
    // Transcription hands over {execSrt: 'output.srt', audio: File | null}
    const { state: handover } = useLocation();
    const [audio, setAudio] = useState(handover?.audio ?? null);
    const [srt, setSrt] = useState(null);
    const [samples, setSamples] = useState([]);
    const [hints, setHints] = useState({ numSpeakers: '', minSpeakers: '', maxSpeakers: '' });
    const [handoverError, setHandoverError] = useState(null);
    const [result, setResult] = useState(null);
    const call = useApiCall();

    useEffect(() => {
        if (!handover?.execSrt) return;
        fetchExecFile(handover.execSrt)
            .then((blob) => setSrt(new File([blob], handover.execSrt, { type: 'application/x-subrip' })))
            .catch((err) => setHandoverError(`Can't load ${handover.execSrt}: ${err.message}`));
    }, [handover]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setResult(null);
        const res = await call.run((onUploadProgress) => diarizeSrt(audio, srt, {
            samples: samples.map((s) => s.file),
            sampleNames: samples.map((s) => s.name.trim() || baseName(s.file)),
            ...hints,
            onUploadProgress,
        }));
        if (res) setResult(res);
    };

    const { loading } = call;

    return (
        <Page>
            <Card>
                <PageHeader title='Speakers' subheader='Audio + SRT: every cue gets a speaker label' />
                <form onSubmit={handleSubmit}>
                    {handoverError && <Message tone='warning' className='mb-4'>{handoverError}</Message>}
                    {handover?.execSrt && !audio && (
                        <Message tone='info' className='mb-4'>Choose the audio file that was transcribed</Message>
                    )}
                    <div className='grid gap-4 sm:grid-cols-2'>
                        <FileField label='Audio' accept='audio/*,video/*' file={audio} onChange={setAudio} disabled={loading} />
                        <FileField label='Subtitles (SRT)' accept='.srt' file={srt} onChange={setSrt} disabled={loading} />
                    </div>
                    <VoiceSamples samples={samples} onChange={setSamples} disabled={loading} />
                    <SpeakerHints hints={hints} onChange={setHints} disabled={loading} />
                    <SubmitButton call={call} disabled={!audio || !srt}>Add speakers</SubmitButton>
                </form>

                <ErrorMessage call={call} />

                {result && (
                    <Message tone='success' header={result.fileName} className='mt-4'>
                        <Stats stats={result.stats}
                               labels={[['speakers', 'Speakers'], ['named', 'Named'], ['split_cues', 'Split cues']]} />
                        <Button variant='primary' className='mt-4' onClick={() => saveBlob(result.blob, result.fileName)}>
                            ⬇ Download
                        </Button>
                    </Message>
                )}
            </Card>
        </Page>
    );
};

export default Speakers;
