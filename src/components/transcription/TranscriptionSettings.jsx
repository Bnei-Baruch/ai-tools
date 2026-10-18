import React from 'react';
import { Dropdown, Form, Header, Segment } from 'semantic-ui-react';

const FORMAT_OPTIONS = [
    { key: 'txt', value: 'txt', text: '--txt (text file)' },
    { key: 'srt', value: 'srt', text: '--srt (subtitles)' }
];

const LANGUAGE_OPTIONS = [
    { key: 'he', value: 'he', text: 'Hebrew (V3)' },
    { key: 'he_bb', value: 'he_bb', text: 'Hebrew (BB)' },
    { key: 'en', value: 'en', text: 'English' },
    { key: 'ru', value: 'ru', text: 'Russian' },
    { key: 'auto', value: 'auto', text: 'Autodetect' }
];

const TranscriptionSettings = ({ language, outputFormats, onLanguageChange, onFormatChange }) => (
    <Segment style={{marginTop: 30}}>
        <Header as='h3'>Choose Your Settings</Header>
        <Form>
            <Form.Group widths='equal'>
                <Form.Field>
                    <label>Language</label>
                    <Dropdown
                        placeholder='Select language'
                        fluid
                        selection
                        options={LANGUAGE_OPTIONS}
                        value={language}
                        onChange={onLanguageChange}
                    />
                </Form.Field>

                <Form.Field>
                    <label>Output Formats</label>
                    <Dropdown
                        placeholder='Select formats'
                        fluid
                        selection
                        multiple
                        options={FORMAT_OPTIONS}
                        value={outputFormats}
                        onChange={onFormatChange}
                    />
                </Form.Field>
            </Form.Group>
        </Form>
    </Segment>
);

export default TranscriptionSettings;
