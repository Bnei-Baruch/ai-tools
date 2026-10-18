import React from 'react';
import { Button, Form, Header } from 'semantic-ui-react';
import FileField from '../form/FileField';

const AUDIO_ACCEPT = 'audio/*,video/*';

export const baseName = (file) => file.name.replace(/\.[^.]+$/, '');

// samples: [{file, name}]; an empty name falls back to the file name.
const VoiceSamples = ({ samples, onChange, disabled }) => {
    const update = (i, fields) => onChange(samples.map((s, j) => (j === i ? { ...s, ...fields } : s)));
    const remove = (i) => onChange(samples.filter((_, j) => j !== i));

    return (
        <>
            <Header as='h4' content='Voice samples (optional)'
                    subheader='Known speakers: a short clip of each voice with the name to label it with' />
            {samples.map((s, i) => (
                <Form.Group key={i} inline>
                    <FileField accept={AUDIO_ACCEPT} file={s.file} disabled={disabled}
                               onChange={(file) => (file ? update(i, { file }) : remove(i))} />
                    <Form.Input placeholder={baseName(s.file)} value={s.name} disabled={disabled}
                                onChange={(e, { value }) => update(i, { name: value })} />
                    <Button type='button' basic icon='trash' disabled={disabled} onClick={() => remove(i)} />
                </Form.Group>
            ))}
            <FileField accept={AUDIO_ACCEPT} file={null} disabled={disabled} placeholder='Add sample'
                       onChange={(file) => file && onChange([...samples, { file, name: '' }])} />
        </>
    );
};

export default VoiceSamples;
