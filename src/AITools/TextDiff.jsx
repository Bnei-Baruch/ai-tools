import React, { useState } from 'react';
import { Container, Form, Header, Segment, Table } from 'semantic-ui-react';
import { tadiffCompare, tadiffCompareTimestamps } from './stt';
import { formatTimestamp } from '../stt/api/transcribe';
import { ErrorMessage, FileField, Stats, SubmitButton, useApiCall } from './SttCommon';

const KINDS = {
    removed: { title: 'Not heard', row: { negative: true } },
    added: { title: 'Extra in audio', row: { positive: true } },
    changed: { title: 'Changed', row: { warning: true } },
};

// One list of differences in audio order; removed ones sit where the text was skipped.
const diffRows = ({ removed, added, changed }) => [
    ...removed.map((r) => ({ kind: 'removed', time: r.at, text: r.text, heard: '' })),
    ...added.map((a) => ({ kind: 'added', time: a.start, text: '', heard: a.heard })),
    ...changed.map((c) => ({ kind: 'changed', time: c.start, text: c.text, heard: c.heard })),
].sort((a, b) => a.time - b.time);

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
    const rows = result ? diffRows(result) : [];

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

                {result && (
                    <>
                        <Stats stats={{
                            ...result.stats,
                            removed: result.removed.length,
                            added: result.added.length,
                            changed: result.changed.length,
                        }} labels={[
                            ['text_words', 'Text words'],
                            ['audio_words', 'Audio words'],
                            ...Object.entries(KINDS).map(([kind, { title }]) => [kind, title]),
                        ]} />
                        {rows.length === 0 ? <Header as='h4' content='No differences' /> : (
                            <Table compact celled>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell collapsing>Time</Table.HeaderCell>
                                        <Table.HeaderCell collapsing />
                                        <Table.HeaderCell>Text</Table.HeaderCell>
                                        <Table.HeaderCell>Heard</Table.HeaderCell>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {rows.map((r, i) => (
                                        <Table.Row key={i} {...KINDS[r.kind].row}>
                                            <Table.Cell collapsing>{formatTimestamp(r.time)}</Table.Cell>
                                            <Table.Cell collapsing>{KINDS[r.kind].title}</Table.Cell>
                                            <Table.Cell dir='auto'>{r.text}</Table.Cell>
                                            <Table.Cell dir='auto'>{r.heard}</Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        )}
                    </>
                )}
            </Segment>
        </Container>
    );
};

export default TextDiff;
