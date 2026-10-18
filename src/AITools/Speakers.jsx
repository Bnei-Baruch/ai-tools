import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Container, Form, Header, Message, Segment } from 'semantic-ui-react';
import { diarizeSrt } from './stt';
import { fetchExecFile, saveBlob } from './tools';
import { ErrorMessage, FileField, Stats, SubmitButton, useApiCall } from './SttCommon';

const AUDIO_ACCEPT = 'audio/*,video/*';

const baseName = (file) => file.name.replace(/\.[^.]+$/, '');

const Speakers = () => {
    // Transcription hands over {execSrt: 'output.srt', audio: File | null}
    const { state: handover } = useLocation();
    const [audio, setAudio] = useState(handover?.audio ?? null);
    const [srt, setSrt] = useState(null);
    const [samples, setSamples] = useState([]); // [{file, name}]
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

    const updateSample = (i, fields) => setSamples(samples.map((s, j) => (j === i ? { ...s, ...fields } : s)));

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
                    {handover?.execSrt && !handover.audio && !audio && (
                        <Message info visible content='Choose the audio file that was transcribed' />
                    )}
                    <Form.Group widths='equal'>
                        <FileField label='Audio' accept={AUDIO_ACCEPT} file={audio} onChange={setAudio} disabled={loading} />
                        <FileField label='Subtitles (SRT)' accept='.srt' file={srt} onChange={setSrt} disabled={loading} />
                    </Form.Group>

                    <Header as='h4' content='Voice samples (optional)'
                            subheader='Known speakers: a short clip of each voice with the name to label it with' />
                    {samples.map((s, i) => (
                        <Form.Group key={i} inline>
                            <FileField accept={AUDIO_ACCEPT} file={s.file} disabled={loading}
                                       onChange={(file) => (file ? updateSample(i, { file }) : setSamples(samples.filter((_, j) => j !== i)))} />
                            <Form.Input placeholder={baseName(s.file)} value={s.name} disabled={loading}
                                        onChange={(e, { value }) => updateSample(i, { name: value })} />
                            <Button type='button' basic icon='trash' disabled={loading}
                                    onClick={() => setSamples(samples.filter((_, j) => j !== i))} />
                        </Form.Group>
                    ))}
                    <FileField accept={AUDIO_ACCEPT} file={null} disabled={loading} placeholder='Add sample'
                               onChange={(file) => file && setSamples([...samples, { file, name: '' }])} />

                    <Header as='h4' content='Number of speakers (optional)' />
                    <Form.Group widths='equal'>
                        {[['numSpeakers', 'Exactly'], ['minSpeakers', 'At least'], ['maxSpeakers', 'At most']].map(([key, label]) => (
                            <Form.Input key={key} type='number' min={1} label={label} value={hints[key]} disabled={loading}
                                        onChange={(e, { value }) => setHints({ ...hints, [key]: value })} />
                        ))}
                    </Form.Group>

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
