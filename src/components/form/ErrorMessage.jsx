import React from 'react';
import { Message } from 'semantic-ui-react';

// call: useApiCall() state
const ErrorMessage = ({ call }) =>
    call.error ? <Message negative visible header='Error' content={call.error} /> : null;

export default ErrorMessage;
