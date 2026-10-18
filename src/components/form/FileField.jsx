import React, { useRef } from 'react';
import { Button, Form, Message } from 'semantic-ui-react';
import { MAX_UPLOAD_SIZE } from '../../api/stt';

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// A button instead of the native input, so a file handed over from another tool shows up too.
const FileField = ({ label, accept, file, onChange, disabled, placeholder = 'Choose file' }) => {
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

export default FileField;
