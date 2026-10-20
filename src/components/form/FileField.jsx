import React, { useRef } from 'react';
import { MAX_UPLOAD_SIZE } from '../../api/stt';
import { Button, Field, Message } from '../ui';

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// A button instead of the native input, so a file handed over from another tool shows up too.
const FileField = ({ label, accept, file, onChange, disabled, placeholder = 'Choose file' }) => {
    const inputRef = useRef(null);
    return (
        <Field label={label}>
            <div className='flex items-center gap-2'>
                <Button className='min-w-0 justify-start' disabled={disabled} onClick={() => inputRef.current.click()}>
                    <span aria-hidden>📄</span>
                    <span className='truncate'>{file ? file.name : placeholder}</span>
                </Button>
                {file && <span className='shrink-0 text-sm text-slate-500'>{formatSize(file.size)}</span>}
            </div>
            <input ref={inputRef} type='file' accept={accept} hidden onChange={(e) => {
                onChange(e.target.files[0] || null);
                e.target.value = '';
            }} />
            {file?.size > MAX_UPLOAD_SIZE && (
                <Message tone='warning' className='p-2 text-sm'>
                    {`The file is ${formatSize(file.size)}: Cloudflare rejects requests over 100 MB`}
                </Message>
            )}
        </Field>
    );
};

export default FileField;
