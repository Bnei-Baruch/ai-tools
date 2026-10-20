import React from 'react';
import { Link } from 'react-router-dom';
import { isToolEnabled } from '../../tools';
import { Button } from '../ui';

// audioFile: the uploaded File (null for a link), handed over to the Speakers tool with output.srt
const TranscriptionResults = ({ onDownload, audioFile }) => (
    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <Button variant="gray" onClick={() => onDownload('output.txt')}>⬇ Download output.txt</Button>
        <Button variant="gray" onClick={() => onDownload('output.srt')}>⬇ Download output.srt</Button>
        {isToolEnabled('speakers') && (
            <Button variant="teal" as={Link} to="/speakers" state={{execSrt: 'output.srt', audio: audioFile}}>
                👥 Add speakers
            </Button>
        )}
    </div>
);

export default TranscriptionResults;
