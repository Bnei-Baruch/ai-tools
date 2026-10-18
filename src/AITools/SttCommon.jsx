import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Icon, Label, Message } from 'semantic-ui-react';
import { MAX_UPLOAD_SIZE } from './stt';

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const formatElapsed = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// A button instead of the native input, so a file handed over from another tool shows up too.
export const FileField = ({ label, accept, file, onChange, disabled, placeholder = 'Choose file' }) => {
    const inputRef = useRef(null);
    return (
        <Form.Field disabled={disabled}>
            {label && <label>{label}</label>}
            <Button type='button' basic icon='file outline' content={file ? file.name : placeholder}
                    onClick={() => inputRef.current.click()} />
            {file && <span style={{ color: 'grey' }}>{formatSize(file.size)}</span>}
            <input ref={inputRef} type='file' accept={accept} hidden onChange={(e) => {
                onChange(e.target.files[0] || null);
                e.target.value = '';
            }} />
            {file?.size > MAX_UPLOAD_SIZE && (
                <Message warning visible size='small'
                         content={`The file is ${formatSize(file.size)}: Cloudflare rejects requests over 100 MB`} />
            )}
        </Form.Field>
    );
};

// State of one stt-api request: run(call) passes call an upload progress callback;
// returns the call's result, or undefined on error (then shown via error).
export const useApiCall = () => {
    const [state, setState] = useState({ loading: false, upload: 0, error: null });
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!state.loading) return;
        setElapsed(0);
        const started = Date.now();
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(id);
    }, [state.loading]);

    const run = async (call) => {
        setState({ loading: true, upload: 0, error: null });
        try {
            return await call((upload) => setState((s) => ({ ...s, upload })));
        } catch (err) {
            setState((s) => ({ ...s, error: err.message }));
        } finally {
            setState((s) => ({ ...s, loading: false }));
        }
    };

    return { ...state, elapsed, run };
};

// The request is synchronous: upload progress first, then only the elapsed time.
export const SubmitButton = ({ call, disabled, children }) => (
    <Button primary size='large' type='submit' disabled={disabled || call.loading}>
        {call.loading ? (
            <>
                <Icon loading name='spinner' />
                {call.upload < 100 ? `Uploading ${call.upload}%` : `Processing… ${formatElapsed(call.elapsed)}`}
            </>
        ) : children}
    </Button>
);

export const ErrorMessage = ({ call }) =>
    call.error ? <Message negative visible header='Error' content={call.error} /> : null;

// labels: [[statsKey, title], ...]
export const Stats = ({ stats, labels }) => (
    <Label.Group style={{ marginTop: 15 }}>
        {labels.filter(([key]) => stats[key] !== undefined).map(([key, title]) => (
            <Label key={key}>{title}<Label.Detail>{stats[key]}</Label.Detail></Label>
        ))}
    </Label.Group>
);
