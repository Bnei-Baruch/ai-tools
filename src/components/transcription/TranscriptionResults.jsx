import React from 'react';
import { Button } from 'semantic-ui-react';
import { Link } from 'react-router-dom';
import { isToolEnabled } from '../../tools';

// audioFile: the uploaded File (null for a link), handed over to the Speakers tool with output.srt
const TranscriptionResults = ({ onDownload, audioFile }) => (
    <div style={{marginTop: 20}}>
        <Button
            color="gray"
            icon="download"
            content="Download output.txt"
            onClick={() => onDownload('output.txt')}
            style={{marginRight: 10}}
        />
        <Button
            color="gray"
            icon="download"
            content="Download output.srt"
            onClick={() => onDownload('output.srt')}
            style={{marginRight: 10}}
        />
        {isToolEnabled('speakers') && (
            <Button
                color="teal"
                icon="users"
                content="Add speakers"
                as={Link}
                to="/speakers"
                state={{execSrt: 'output.srt', audio: audioFile}}
            />
        )}
    </div>
);

export default TranscriptionResults;
