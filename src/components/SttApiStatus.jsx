import React, { useEffect, useState } from 'react';
import { sttHealth } from '../api/stt';
import { cx } from './ui';

const HEALTH_INTERVAL_MS = 60000;

// Menu item with a green/red dot from stt-api's /health.
const SttApiStatus = () => {
    const [alive, setAlive] = useState(null);

    useEffect(() => {
        const check = () => sttHealth().then(() => setAlive(true), () => setAlive(false));
        check();
        const id = setInterval(check, HEALTH_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    const color = alive === null ? 'bg-slate-400' : alive ? 'bg-green-500' : 'bg-red-500';
    return (
        <span className='flex items-center gap-2 px-4 py-3 text-sm text-slate-700'
              title={alive === false ? 'STT API is unreachable' : undefined}>
            <span className={cx('size-2.5 rounded-full', color)} />STT API
        </span>
    );
};

export default SttApiStatus;
