import React from 'react';
import FileField from '../form/FileField';
import { Button, Input, SectionHeader } from '../ui';

const AUDIO_ACCEPT = 'audio/*,video/*';

export const baseName = (file) => file.name.replace(/\.[^.]+$/, '');

// samples: [{file, name}]; an empty name falls back to the file name.
const VoiceSamples = ({ samples, onChange, disabled }) => {
    const update = (i, fields) => onChange(samples.map((s, j) => (j === i ? { ...s, ...fields } : s)));
    const remove = (i) => onChange(samples.filter((_, j) => j !== i));

    return (
        <>
            <SectionHeader title='Voice samples (optional)'
                           subheader='Known speakers: a short clip of each voice with the name to label it with' />
            {samples.map((s, i) => (
                <div key={i} className='mb-2 flex items-center gap-2'>
                    <FileField accept={AUDIO_ACCEPT} file={s.file} disabled={disabled}
                               onChange={(file) => (file ? update(i, { file }) : remove(i))} />
                    <Input className='max-w-xs' placeholder={baseName(s.file)} value={s.name} disabled={disabled}
                           onChange={(e) => update(i, { name: e.target.value })} />
                    <Button aria-label='Remove sample' disabled={disabled} onClick={() => remove(i)}>🗑</Button>
                </div>
            ))}
            <FileField accept={AUDIO_ACCEPT} file={null} disabled={disabled} placeholder='Add sample'
                       onChange={(file) => file && onChange([...samples, { file, name: '' }])} />
        </>
    );
};

export default VoiceSamples;
