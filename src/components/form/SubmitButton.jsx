import React from 'react';
import { formatElapsed } from '../../utils';
import { Button } from '../ui';

// call: useApiCall() state. The request is synchronous: upload progress first, then only the elapsed time.
const SubmitButton = ({ call, disabled, children }) => (
    <Button variant='primary' size='lg' type='submit' className='mt-5' disabled={disabled} loading={call.loading}>
        {call.loading
            ? call.upload < 100 ? `Uploading ${call.upload}%` : `Processing… ${formatElapsed(call.elapsed)}`
            : children}
    </Button>
);

export default SubmitButton;
