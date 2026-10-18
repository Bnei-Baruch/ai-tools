import { useState } from 'react';
import useElapsed from './useElapsed';

// State of one stt-api request: run(call) passes call an upload progress callback;
// returns the call's result, or undefined on error (then shown via error).
export default function useApiCall() {
    const [state, setState] = useState({ loading: false, upload: 0, error: null });
    const elapsed = useElapsed(state.loading);

    const run = async (call) => {
        setState({ loading: true, upload: 0, error: null });
        try {
            return await call((upload) => setState((s) => ({ ...s, upload })));
        } catch (err) {
            setState((s) => ({ ...s, error: err.message }));
        } finally {
            setState((s) => ({ ...s, loading: false }));
        }
    };

    return { ...state, elapsed, run };
}
