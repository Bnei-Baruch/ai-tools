import React, { Component, Fragment } from 'react';
import { Progress,Message,Button,Input,Form,Segment,Header,Dropdown } from 'semantic-ui-react';
import Upload from 'rc-upload';
import LoginPage from './LoginPage';
import {kc} from "./UserManager";
import mqtt from "./mqtt";
import {AI_BACKEND} from "./consts";
import {getConfig, updateServiceArgs, parseArgsFromConfig, createArgsArray} from "./tools";

class Transcription extends Component {

    state = {
        pass: false,
        user: null,
        roles: [],
        percent: 0,
        progress: 0,
        serviceAlive: false,
        logText: '',
        reportInterval: null,
        inputFile: 'tmp/input.mp3',
        outputFormats: ['txt'], // array of selected formats
        configLoading: false,
        stButton: false,
        formatOptions: [
            { key: 'txt', value: 'txt', text: '--txt (text file)' },
            { key: 'srt', value: 'srt', text: '--srt (subtitles)' }
        ]
    };

    componentDidMount() {
        this.loadConfigFields()
    }

    checkPermission = (user) => {
        const trl_public = kc.hasRealmRole("bb_user");
        if(trl_public) {
            this.setState({user, roles: user.roles});
            this.initMQTT(user);
        } else {
            alert("Access denied!");
            kc.logout();
        }
    };

    progress = (step, file) => {
        let count = Math.round(step.percent);
        //console.log('onProgress', step, file.name);
        this.setState({percent: count});
    };

    uploadDone = (file_data) => {
        console.log(":: UploadApp - got data: ", file_data);
        // Set uploaded file name to input field
        const uploadedFileName = `tmp/${file_data.file_name}`;
        this.setState({
            inputFile: uploadedFileName,
            percent: 0
        });
    };

    initMQTT = (user) => {
        mqtt.init(user, (data) => {
            console.log("[mqtt] init: ", data, user);
            //mqtt.join("subtitles/morning_lesson/he/slide");
            //mqtt.join("subtitles/morning_lesson/he/question");
            //mqtt.join("janus/events/#");
            //mqtt.join("keycloak/events/#");
            mqtt.join("exec/status/ai-trns")
            mqtt.join("exec/service/ai-trns/#")
            mqtt.join("exec/state/ai-trns")
            mqtt.join("exec/service/data/#")
            this.sendStatus();
            mqtt.watch((message) => {
                this.handleMessage(message);
            });
        });
    };

    handleMessage = (message) => {
        if (message?.action === "status") {
            const {alive, runtime, name} = message.data || {};
            console.log(`[status] ${name} is ${alive ? "alive" : "stopped"}, ran for ${runtime.toFixed(1)} sec`);
            this.setState({ serviceStatus: alive, runtime });
            if(!alive) {
                this.setState({ percent: 0, stButton: false });
                clearInterval(this.state.reportInterval);
            } else {
                this.setState({ stButton: true });
            }
        }

        if (message?.data?.Stdout) {
            const logLine = message.data.Stdout[0];
            console.log("[mqtt] log:", logLine);
            const percentMatch = logLine.match(/(\d+)(%|٪)/);
            if (percentMatch) {
                const percent = parseInt(percentMatch[1]);
                console.log("[mqtt] percent:", percent);
                this.setState({ percent, logText: logLine });
            }
        }
    }

    sendMessage = () => {
        mqtt.send("start", false, "exec/service/ai-trns/python");
    }

    sendStatus = () => {
        mqtt.send("status", false, "exec/service/ai-trns/python");
    }

    buttonDisable = () => {
        this.setState({stButton: true});
        setTimeout(() => {
            this.setState({stButton: false});
        }, 10000);
    }

    startTranscription = () => {
        this.buttonDisable();
        this.sendMessage();
        setTimeout(() => {
            const reportInterval = setInterval(() => {
                mqtt.send("report", false, "exec/service/ai-trns/python");
                mqtt.send("status", false, "exec/service/ai-trns/python");
            }, 1000);
            this.setState({reportInterval});
        }, 3000);
    }

    // Methods for working with configuration
    loadConfigFields = async () => {
        this.setState({ configLoading: true });

        try {
            const config = await getConfig();
            const parsed = parseArgsFromConfig(config);
            this.setState({
                inputFile: parsed.inputFile,
                outputFormats: parsed.outputFormats
            });
        } catch (error) {
            console.error('Configuration loading error:', error);
            alert('Configuration loading error');
        } finally {
            this.setState({ configLoading: false });
        }
    }

    saveConfiguration = async () => {
        const { inputFile, outputFormats } = this.state;
        this.setState({ configLoading: true });

        try {
            // Create arguments array
            const args = createArgsArray(inputFile, outputFormats);

            // Update whisper service arguments via correct API
            await updateServiceArgs('whisper', args);

            alert('Configuration saved successfully');
        } catch (error) {
            console.error('Configuration saving error:', error);
            alert('Configuration saving error');
        } finally {
            this.setState({ configLoading: false });
        }
    }

    handleInputFileChange = (value) => {
        this.setState({ inputFile: value });
    }

    handleFormatChange = (e, { value }) => {
        this.setState({ outputFormats: value });
    }

    handleDownload = async (fileName) => {
        try {
            const response = await fetch(`https://ai.isr.sh/${fileName}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            alert(`Ошибка при загрузке файла: ${error.message}`);
        }
    }

    render() {
        const {user, roles, stButton} = this.state;

        const props = {
            action: `${AI_BACKEND}`,
            //headers: {'Authorization': 'bearer ' + getToken()},
            type: 'drag',
            accept: '.mp4, .mp3',
            beforeUpload(file) {
                console.log('beforeUpload', file.name);
            },
            onStart(file) {
                console.log('onStart', file.name);
            },
            onError(err) {
                console.log('onError', err);
            },

        };

        let opt = roles.map((role,i) => {
            if(role === "bb_user") {
                return (
                    <Message>
                        <Upload
                            {...this.props}
                            {...props}
                            className="aricha"
                            onSuccess={this.uploadDone}
                            onProgress={this.progress} >
                            Drop file here or click me
                        </Upload>
                        <Progress label='' percent={this.state.percent} indicating progress='percent' />
                        <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'monospace', marginTop: 10}}>
                             {this.state.logText}
                        </pre>
                        <Button key={i + 100} disabled={stButton} size='massive' color='blue' onClick={this.startTranscription} >
                            Start Transcription
                        </Button>
                        <div style={{marginTop: 20}}>
                            <Button 
                                color="gray" 
                                icon="download" 
                                content="Download output.txt" 
                                onClick={() => this.handleDownload('output.txt')}
                                style={{marginRight: 10}}
                            />
                            <Button 
                                color="gray" 
                                icon="download" 
                                content="Download output.srt" 
                                onClick={() => this.handleDownload('output.srt')}
                            />
                        </div>

                        {/* Configuration section */}
                        <Segment style={{marginTop: 30}}>
                            <Header as='h3'>AI Transcription Settings</Header>
                            <Form>
                                <Form.Field>
                                    <label>AI Transcription Service Configuration</label>
                                    <Button
                                        color='blue'
                                        onClick={this.loadConfigFields}
                                        loading={this.state.configLoading}
                                        style={{marginBottom: 15}}
                                    >
                                        Load Current Settings
                                    </Button>
                                </Form.Field>

                                <Form.Field>
                                    <label>Input File</label>
                                    <Input
                                        placeholder="tmp/input.mp3"
                                        value={this.state.inputFile}
                                        onChange={(e) => this.handleInputFileChange(e.target.value)}
                                    />
                                    <small style={{color: '#666'}}>
                                        Path to audio/video file for transcription
                                    </small>
                                </Form.Field>

                                <Form.Field>
                                    <label>Output Formats</label>
                                    <Dropdown
                                        placeholder='Select formats'
                                        fluid
                                        selection
                                        multiple
                                        options={this.state.formatOptions}
                                        value={this.state.outputFormats}
                                        onChange={this.handleFormatChange}
                                    />
                                    <small style={{color: '#666'}}>
                                        Select one or more output formats
                                    </small>
                                </Form.Field>

                                <div style={{marginTop: 20}}>
                                    <Button
                                        color='green'
                                        size='large'
                                        onClick={this.saveConfiguration}
                                        loading={this.state.configLoading}
                                        disabled={!this.state.inputFile.trim() || this.state.outputFormats.length === 0}
                                    >
                                        Save Settings
                                    </Button>
                                </div>

                                <div style={{marginTop: 15, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 5}}>
                                    <small style={{color: '#666'}}>
                                        <strong>Current Settings:</strong><br/>
                                        Input file: <code>{this.state.inputFile}</code><br/>
                                        Output formats: <code>{this.state.outputFormats.map(f => `--${f}`).join(' ')}</code><br/>
                                        Command: <code>python3 whisper_fullfile_cli.py {this.state.outputFormats.map(f => `--${f}`).join(' ')} --input {this.state.inputFile}</code>
                                    </small>
                                </div>
                            </Form>
                        </Segment>
                    </Message>);
            }
            return null
        });

        return (
            <Fragment>
                <LoginPage user={user} enter={opt} checkPermission={this.checkPermission} />
            </Fragment>

        );
    }
}

export default Transcription;
