import React from 'react';
import { Form, Header } from 'semantic-ui-react';

const FIELDS = [['numSpeakers', 'Exactly'], ['minSpeakers', 'At least'], ['maxSpeakers', 'At most']];

// hints: {numSpeakers, minSpeakers, maxSpeakers}, '' = not set
const SpeakerHints = ({ hints, onChange, disabled }) => (
    <>
        <Header as='h4' content='Number of speakers (optional)' />
        <Form.Group widths='equal'>
            {FIELDS.map(([key, label]) => (
                <Form.Input key={key} type='number' min={1} label={label} value={hints[key]} disabled={disabled}
                            onChange={(e, { value }) => onChange({ ...hints, [key]: value })} />
            ))}
        </Form.Group>
    </>
);

export default SpeakerHints;
