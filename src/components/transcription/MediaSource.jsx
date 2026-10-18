import React from 'react';
import { Form, Input } from 'semantic-ui-react';
import Upload from 'rc-upload';
import { AI_BACKEND } from '../../consts';

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
            className="aricha"
            onSuccess={onUploadDone}
            onStart={onUploadStart}
            onProgress={onUploadProgress} >
            Drop file here or click me
        </Upload>
        <Form>
            <Form.Field>
                <label>OR</label>
                <Input
                    placeholder="Put http link here.."
                    value={inputFile}
                    onChange={(e) => onInputFileChange(e.target.value)}
                />
            </Form.Field>
        </Form>
    </>
);

export default MediaSource;
