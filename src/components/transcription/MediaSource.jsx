import React, { useRef, useState } from 'react';
import { MAX_UPLOAD_SIZE } from '../../api/aiTrns';
import { cx, Field, Input, Message } from '../ui';

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// The media to transcribe: a file (sent with the job) or a link typed in.
const MediaSource = ({ file, onFileChange, link, onLinkChange, disabled }) => {
    const inputRef = useRef(null);
    const [over, setOver] = useState(false);

    const drop = (e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files[0]) onFileChange(e.dataTransfer.files[0]);
    };

    return (
        <>
            <div
                role='button'
                tabIndex={0}
                onClick={() => !disabled && inputRef.current.click()}
                onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={drop}
                className={cx('block min-h-[50px] w-full cursor-pointer border-2 border-dashed border-[#0087F7] px-2 text-center text-sm leading-[46px] font-bold',
                    over ? 'bg-[#a5e3a5]' : 'bg-[#bfecbf]', disabled && 'cursor-not-allowed opacity-60')}>
                {file ? `${file.name} (${formatSize(file.size)})` : 'Drop file here or click me'}
            </div>
            <input ref={inputRef} type='file' accept='audio/*,video/*' hidden onChange={(e) => {
                if (e.target.files[0]) onFileChange(e.target.files[0]);
                e.target.value = '';
            }} />
            {file?.size > MAX_UPLOAD_SIZE && (
                <Message tone='warning' className='mt-2 p-2 text-sm'>
                    {`The file is ${formatSize(file.size)}: uploads are limited to 100 MB, use a link instead`}
                </Message>
            )}
            <Field label="OR" htmlFor="media-link" className="mt-4 text-left">
                <Input
                    id="media-link"
                    placeholder="https://cdn.kabbalahmedia.info/..."
                    value={link}
                    disabled={disabled}
                    onChange={(e) => onLinkChange(e.target.value)}
                />
            </Field>
        </>
    );
};

export default MediaSource;
