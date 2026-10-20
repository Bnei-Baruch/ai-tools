import React from 'react';
import { formatTimestamp } from '../../api/transcribe';
import Stats from '../form/Stats';
import { cx } from '../ui';

const KINDS = {
    removed: { title: 'Not heard', row: 'bg-red-50 text-red-900' },
    added: { title: 'Extra in audio', row: 'bg-green-50 text-green-900' },
    changed: { title: 'Changed', row: 'bg-amber-50 text-amber-900' },
};

const CELL = 'border border-slate-200 px-3 py-1.5';

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
            {rows.length === 0 ? <h4 className='mt-4 font-semibold'>No differences</h4> : (
                <table className='mt-4 w-full border-collapse text-sm'>
                    <thead className='bg-slate-50 text-left'>
                        <tr>
                            <th className={cx(CELL, 'w-px whitespace-nowrap')}>Time</th>
                            <th className={cx(CELL, 'w-px')} />
                            <th className={CELL}>Text</th>
                            <th className={CELL}>Heard</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} className={KINDS[r.kind].row}>
                                <td className={cx(CELL, 'whitespace-nowrap tabular-nums')}>{formatTimestamp(r.time)}</td>
                                <td className={cx(CELL, 'whitespace-nowrap')}>{KINDS[r.kind].title}</td>
                                <td className={CELL} dir='auto'>{r.text}</td>
                                <td className={CELL} dir='auto'>{r.heard}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </>
    );
};

export default DiffResult;
