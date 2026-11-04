import React from 'react';

// labels: [[statsKey, title], ...]; keys missing from stats are skipped.
const Stats = ({ stats, labels }) => (
    <div className='mt-4 flex flex-wrap gap-2'>
        {labels.filter(([key]) => stats[key] !== undefined).map(([key, title]) => (
            <span key={key} className='rounded bg-slate-100 px-2.5 py-1 text-sm text-slate-700'>
                {title}<b className='ml-2 text-slate-900'>{stats[key]}</b>
            </span>
        ))}
    </div>
);

export default Stats;
