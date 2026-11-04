import React, { useState } from 'react';
import { tadiffCompare, tadiffCompareTimestamps } from '../api/stt';
import useApiCall from '../hooks/useApiCall';
import FileField from '../components/form/FileField';
import SubmitButton from '../components/form/SubmitButton';
import ErrorMessage from '../components/form/ErrorMessage';
import DiffResult from '../components/textdiff/DiffResult';
import { Card, Check, Field, Page, PageHeader, TextArea } from '../components/ui';

const TextDiff = () => {
    const [mode, setMode] = useState('audio'); // 'audio' | 'timestamps'
    const [audio, setAudio] = useState(null);
    const [timestamps, setTimestamps] = useState(null);
    const [text, setText] = useState('');
    const [result, setResult] = useState(null);
    const call = useApiCall();

    const source = mode === 'audio' ? audio : timestamps;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setResult(null);
        const res = await call.run((onUploadProgress) => (mode === 'audio'
            ? tadiffCompare(audio, text, { onUploadProgress })
            : tadiffCompareTimestamps(new File([text], 'text.txt', { type: 'text/plain' }), timestamps, { onUploadProgress })));
        if (res) setResult(res);
    };

    const { loading } = call;

    return (
        <Page>
            <Card>
                <PageHeader title='Text diff' subheader='Where the audio differs from the text' />
                <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
                    <div className='flex gap-6'>
                        <Check type='radio' name='textdiff-mode' label='Audio' checked={mode === 'audio'} disabled={loading}
                               onChange={() => setMode('audio')} />
                        <Check type='radio' name='textdiff-mode' label='Word timestamps (JSON)' checked={mode === 'timestamps'}
                               disabled={loading} onChange={() => setMode('timestamps')} />
                    </div>
                    {mode === 'audio'
                        ? <FileField label='Audio' accept='audio/*,video/*' file={audio} onChange={setAudio} disabled={loading} />
                        : <FileField label='Timestamps: [{"word", "start", "end"}, ...]' accept='.json,application/json'
                                     file={timestamps} onChange={setTimestamps} disabled={loading} />}

                    <Field label='Text' htmlFor='textdiff-text'>
                        <TextArea id='textdiff-text' dir='auto' rows={8} value={text} disabled={loading}
                                  onChange={(e) => setText(e.target.value)} />
                    </Field>
                    <FileField accept='.txt,text/plain' file={null} disabled={loading} placeholder='Load text from .txt'
                               onChange={(file) => file && file.text().then(setText)} />

                    <div>
                        <SubmitButton call={call} disabled={!source || !text.trim()}>Compare</SubmitButton>
                    </div>
                </form>

                <ErrorMessage call={call} />

                {result && <DiffResult result={result} />}
            </Card>
        </Page>
    );
};

export default TextDiff;
