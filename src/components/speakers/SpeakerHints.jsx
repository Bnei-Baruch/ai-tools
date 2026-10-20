import React from 'react';
import { Field, Input, SectionHeader } from '../ui';

const FIELDS = [['numSpeakers', 'Exactly'], ['minSpeakers', 'At least'], ['maxSpeakers', 'At most']];

// hints: {numSpeakers, minSpeakers, maxSpeakers}, '' = not set
const SpeakerHints = ({ hints, onChange, disabled }) => (
    <>
        <SectionHeader title='Number of speakers (optional)' />
        <div className='grid gap-4 sm:grid-cols-3'>
            {FIELDS.map(([key, label]) => (
                <Field key={key} label={label} htmlFor={`hint-${key}`}>
                    <Input id={`hint-${key}`} type='number' min={1} value={hints[key]} disabled={disabled}
                           onChange={(e) => onChange({ ...hints, [key]: e.target.value })} />
                </Field>
            ))}
        </div>
    </>
);

export default SpeakerHints;
