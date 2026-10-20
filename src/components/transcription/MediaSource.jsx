import React from 'react';
import Upload from 'rc-upload';
import { AI_BACKEND } from '../../consts';
import { Field, Input } from '../ui';

const uploadProps = {
    action: `${AI_BACKEND}`,
    //headers: {'Authorization': 'bearer ' + getToken()},
    type: 'drag',
    accept: '.mp4, .mp3',
    beforeUpload(file) {
        console.log('beforeUpload', file.name);
    },
    onError(err) {
        console.log('onError', err);
    },
};

// The file to transcribe: uploaded to AI_BACKEND, or a link typed in.
const MediaSource = ({ inputFile, onInputFileChange, onUploadStart, onUploadProgress, onUploadDone }) => (
    <>
        <Upload
            {...uploadProps}
            className="block h-[50px] w-full cursor-pointer border-2 border-dashed border-[#0087F7] bg-[#bfecbf] text-center text-sm leading-[46px] font-bold"
            onSuccess={onUploadDone}
            onStart={onUploadStart}
            onProgress={onUploadProgress} >
            Drop file here or click me
        </Upload>
        <Field label="OR" htmlFor="media-link" className="mt-4 text-left">
            <Input
                id="media-link"
                placeholder="Put http link here.."
                value={inputFile}
                onChange={(e) => onInputFileChange(e.target.value)}
            />
        </Field>
    </>
);

export default MediaSource;
