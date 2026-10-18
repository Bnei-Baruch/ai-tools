import { useEffect, useState } from 'react';

// Whole seconds since running became true; restarts on every run.
export default function useElapsed(running) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!running) return;
        setElapsed(0);
        const started = Date.now();
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(id);
    }, [running]);

    return elapsed;
}
