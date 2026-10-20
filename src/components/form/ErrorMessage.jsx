import React from 'react';
import { Message } from '../ui';

// call: useApiCall() state
const ErrorMessage = ({ call }) =>
    call.error ? <Message tone='error' header='Error' className='mt-4'>{call.error}</Message> : null;

export default ErrorMessage;
