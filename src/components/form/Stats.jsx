import React from 'react';
import { Label } from 'semantic-ui-react';

// labels: [[statsKey, title], ...]; keys missing from stats are skipped.
const Stats = ({ stats, labels }) => (
    <Label.Group style={{ marginTop: 15 }}>
        {labels.filter(([key]) => stats[key] !== undefined).map(([key, title]) => (
            <Label key={key}>{title}<Label.Detail>{stats[key]}</Label.Detail></Label>
        ))}
    </Label.Group>
);

export default Stats;
