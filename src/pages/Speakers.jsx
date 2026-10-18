import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Container, Form, Header, Message, Segment } from 'semantic-ui-react';
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

    const handleSubmit = async () => {
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
        <Container style={{ marginTop: 20 }}>
            <Segment>
                <Header as='h2' content='Speakers' subheader='Audio + SRT: every cue gets a speaker label' />
                <Form onSubmit={handleSubmit}>
                    {handoverError && <Message warning visible content={handoverError} />}
                    {handover?.execSrt && !audio && (
                        <Message info visible content='Choose the audio file that was transcribed' />
                    )}
                    <Form.Group widths='equal'>
                        <FileField label='Audio' accept='audio/*,video/*' file={audio} onChange={setAudio} disabled={loading} />
                        <FileField label='Subtitles (SRT)' accept='.srt' file={srt} onChange={setSrt} disabled={loading} />
                    </Form.Group>
                    <VoiceSamples samples={samples} onChange={setSamples} disabled={loading} />
                    <SpeakerHints hints={hints} onChange={setHints} disabled={loading} />
                    <SubmitButton call={call} disabled={!audio || !srt}>Add speakers</SubmitButton>
                </Form>

                <ErrorMessage call={call} />

                {result && (
                    <Message positive visible>
                        <Message.Header>{result.fileName}</Message.Header>
                        <Stats stats={result.stats}
                               labels={[['speakers', 'Speakers'], ['named', 'Named'], ['split_cues', 'Split cues']]} />
                        <Button primary icon='download' content='Download'
                                onClick={() => saveBlob(result.blob, result.fileName)} />
                    </Message>
                )}
            </Segment>
        </Container>
    );
};

export default Speakers;
