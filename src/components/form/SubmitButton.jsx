import React from 'react';
import { Button, Icon } from 'semantic-ui-react';
import { formatElapsed } from '../../utils';

// call: useApiCall() state. The request is synchronous: upload progress first, then only the elapsed time.
const SubmitButton = ({ call, disabled, children }) => (
    <Button primary size='large' type='submit' disabled={disabled || call.loading}>
        {call.loading ? (
            <>
                <Icon loading name='spinner' />
                {call.upload < 100 ? `Uploading ${call.upload}%` : `Processing… ${formatElapsed(call.elapsed)}`}
            </>
        ) : children}
    </Button>
);

export default SubmitButton;
