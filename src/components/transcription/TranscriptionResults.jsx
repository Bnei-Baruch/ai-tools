import React from 'react';
import { Link } from 'react-router-dom';
import { isToolEnabled } from '../../tools';
import { Button } from '../ui';

// formats: what the job was asked for; jobId with the uploaded audioFile or the url go to the Speakers tool
const TranscriptionResults = ({ formats, onDownload, jobId, audioFile, url }) => (
    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {formats.map((f) => (
            <Button key={f} variant="gray" onClick={() => onDownload(f)}>⬇ Download {f}</Button>
        ))}
        {isToolEnabled('speakers') && (
            <Button variant="teal" as={Link} to="/speakers" state={{ jobId, audio: audioFile, url }}>
                👥 Add speakers
            </Button>
        )}
    </div>
);

export default TranscriptionResults;
