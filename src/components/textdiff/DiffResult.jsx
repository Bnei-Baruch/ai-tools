import React from 'react';
import { Header, Table } from 'semantic-ui-react';
import { formatTimestamp } from '../../api/transcribe';
import Stats from '../form/Stats';

const KINDS = {
    removed: { title: 'Not heard', row: { negative: true } },
    added: { title: 'Extra in audio', row: { positive: true } },
    changed: { title: 'Changed', row: { warning: true } },
};

// One list of differences in audio order; removed ones sit where the text was skipped.
const diffRows = ({ removed, added, changed }) => [
    ...removed.map((r) => ({ kind: 'removed', time: r.at, text: r.text, heard: '' })),
    ...added.map((a) => ({ kind: 'added', time: a.start, text: '', heard: a.heard })),
    ...changed.map((c) => ({ kind: 'changed', time: c.start, text: c.text, heard: c.heard })),
].sort((a, b) => a.time - b.time);

// result: the tadiff response {removed, added, changed, stats}
const DiffResult = ({ result }) => {
    const rows = diffRows(result);
    return (
        <>
            <Stats stats={{
                ...result.stats,
                removed: result.removed.length,
                added: result.added.length,
                changed: result.changed.length,
            }} labels={[
                ['text_words', 'Text words'],
                ['audio_words', 'Audio words'],
                ...Object.entries(KINDS).map(([kind, { title }]) => [kind, title]),
            ]} />
            {rows.length === 0 ? <Header as='h4' content='No differences' /> : (
                <Table compact celled>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell collapsing>Time</Table.HeaderCell>
                            <Table.HeaderCell collapsing />
                            <Table.HeaderCell>Text</Table.HeaderCell>
                            <Table.HeaderCell>Heard</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {rows.map((r, i) => (
                            <Table.Row key={i} {...KINDS[r.kind].row}>
                                <Table.Cell collapsing>{formatTimestamp(r.time)}</Table.Cell>
                                <Table.Cell collapsing>{KINDS[r.kind].title}</Table.Cell>
                                <Table.Cell dir='auto'>{r.text}</Table.Cell>
                                <Table.Cell dir='auto'>{r.heard}</Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table>
            )}
        </>
    );
};

export default DiffResult;
