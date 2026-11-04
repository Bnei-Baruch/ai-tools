import React, { useEffect, useState } from 'react';
import { health } from '../api/tools';
import { cx } from './ui';

const HEALTH_INTERVAL_MS = 60000;

// Menu item with a green/red dot from ai-trns /health: green while a diarize worker is up.
const SttApiStatus = () => {
    const [alive, setAlive] = useState(null);

    useEffect(() => {
        const check = () => health().then(
            (h) => setAlive(Object.values(h.workers || {}).some((w) => w.engines?.includes('diarize'))),
            () => setAlive(false));
        check();
        const id = setInterval(check, HEALTH_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    const color = alive === null ? 'bg-slate-400' : alive ? 'bg-green-500' : 'bg-red-500';
    return (
        <span className='flex items-center gap-2 px-4 py-3 text-sm text-slate-700'
              title={alive === false ? 'ai-trns or its diarize worker is unreachable' : undefined}>
            <span className={cx('size-2.5 rounded-full', color)} />ai-trns
        </span>
    );
};

export default SttApiStatus;
