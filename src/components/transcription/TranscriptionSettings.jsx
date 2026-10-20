import React from 'react';
import { Card, Check, Field, Select } from '../ui';

const FORMAT_OPTIONS = [
    { value: 'txt', text: '--txt (text file)' },
    { value: 'srt', text: '--srt (subtitles)' }
];

const LANGUAGE_OPTIONS = [
    { value: 'he', text: 'Hebrew (V3)' },
    { value: 'en', text: 'English' },
    { value: 'ru', text: 'Russian' },
    { value: 'auto', text: 'Autodetect' }
];

// onLanguageChange(language), onFormatChange(formats[])
const TranscriptionSettings = ({ language, outputFormats, onLanguageChange, onFormatChange }) => {
    const toggleFormat = (value, on) =>
        onFormatChange(FORMAT_OPTIONS.map((o) => o.value).filter((v) => (v === value ? on : outputFormats.includes(v))));

    return (
        <Card className="mt-8 text-left text-base">
            <h3 className="mb-4 text-lg font-semibold">Choose Your Settings</h3>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language" htmlFor="transcription-language">
                    <Select id="transcription-language" value={language} onChange={(e) => onLanguageChange(e.target.value)}>
                        {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                    </Select>
                </Field>

                <Field label="Output Formats">
                    <div className="flex flex-wrap gap-4 py-2">
                        {FORMAT_OPTIONS.map((o) => (
                            <Check key={o.value} label={o.text} checked={outputFormats.includes(o.value)}
                                   onChange={(e) => toggleFormat(o.value, e.target.checked)} />
                        ))}
                    </div>
                </Field>
            </div>
        </Card>
    );
};

export default TranscriptionSettings;
