import React, { useState } from 'react';
import { Container, Form, Header, Segment } from 'semantic-ui-react';
import { tadiffCompare, tadiffCompareTimestamps } from '../api/stt';
import useApiCall from '../hooks/useApiCall';
import FileField from '../components/form/FileField';
import SubmitButton from '../components/form/SubmitButton';
import ErrorMessage from '../components/form/ErrorMessage';
import DiffResult from '../components/textdiff/DiffResult';

const TextDiff = () => {
    const [mode, setMode] = useState('audio'); // 'audio' | 'timestamps'
    const [audio, setAudio] = useState(null);
    const [timestamps, setTimestamps] = useState(null);
    const [text, setText] = useState('');
    const [result, setResult] = useState(null);
    const call = useApiCall();

    const source = mode === 'audio' ? audio : timestamps;

    const handleSubmit = async () => {
        setResult(null);
        const res = await call.run((onUploadProgress) => (mode === 'audio'
            ? tadiffCompare(audio, text, { onUploadProgress })
            : tadiffCompareTimestamps(new File([text], 'text.txt', { type: 'text/plain' }), timestamps, { onUploadProgress })));
        if (res) setResult(res);
    };

    const { loading } = call;

    return (
        <Container style={{ marginTop: 20 }}>
            <Segment>
                <Header as='h2' content='Text diff' subheader='Where the audio differs from the text' />
                <Form onSubmit={handleSubmit}>
                    <Form.Group inline>
                        <Form.Radio label='Audio' checked={mode === 'audio'} disabled={loading}
                                    onChange={() => setMode('audio')} />
                        <Form.Radio label='Word timestamps (JSON)' checked={mode === 'timestamps'} disabled={loading}
                                    onChange={() => setMode('timestamps')} />
                    </Form.Group>
                    {mode === 'audio'
                        ? <FileField label='Audio' accept='audio/*,video/*' file={audio} onChange={setAudio} disabled={loading} />
                        : <FileField label='Timestamps: [{"word", "start", "end"}, ...]' accept='.json,application/json'
                                     file={timestamps} onChange={setTimestamps} disabled={loading} />}

                    <Form.TextArea label='Text' dir='auto' rows={8} value={text} disabled={loading}
                                   onChange={(e, { value }) => setText(value)} />
                    <FileField accept='.txt,text/plain' file={null} disabled={loading} placeholder='Load text from .txt'
                               onChange={(file) => file && file.text().then(setText)} />

                    <SubmitButton call={call} disabled={!source || !text.trim()}>Compare</SubmitButton>
                </Form>

                <ErrorMessage call={call} />

                {result && <DiffResult result={result} />}
            </Segment>
        </Container>
    );
};

export default TextDiff;
