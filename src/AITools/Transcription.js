import React, { Component, Fragment } from 'react';
import { Progress,Message,Button,Input,Form,Segment,Header,Dropdown } from 'semantic-ui-react';
import Upload from 'rc-upload';
import LoginPage from './LoginPage';
import {kc} from "./UserManager";
import mqtt from "./mqtt";
import {AI_BACKEND, EXEC_API} from "./consts";
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
        inputFile: '',
        outputFormats: ['srt'], // array of selected formats
        language: 'he', // default to Hebrew
        configLoading: false,
        stButton: false,
        formatOptions: [
            { key: 'txt', value: 'txt', text: '--txt (text file)' },
            { key: 'srt', value: 'srt', text: '--srt (subtitles)' }
        ],
        languageOptions: [
            { key: 'he', value: 'he', text: 'Hebrew (עברית)' },
            { key: 'en', value: 'en', text: 'English' },
            { key: 'ru', value: 'ru', text: 'Russian (Русский)' },
            { key: 'auto', value: 'auto', text: 'Autodetect' }
        ]
    };

    componentDidMount() {
        //this.loadConfigFields()
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

    uploadStart = () => {
        console.log("uploading...");
        this.setState({logText: "Uploading..."})
    }

    uploadDone = (file_data) => {
        console.log(":: UploadApp - got data: ", file_data);
        // Set uploaded file name to input field
        const uploadedFileName = `tmp/${file_data.file_name}`;
        this.setState({
            inputFile: uploadedFileName,
            logText: "",
            percent: 0
        }, () => {
            this.saveConfiguration();
        });
    };

    initMQTT = (user) => {
        mqtt.init(user, (data) => {
            console.log("[mqtt] init: ", data, user);
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
            console.log(`[status] ${name} is ${alive ? "alive" : "stopped"}, ran for ${runtime?.toFixed(1)} sec`);
            this.setState({ serviceStatus: alive, runtime });
            if(!alive) {
                this.setState({ percent: 0, stButton: false });
                if(this.state.logText === "Transcription in progress...")
                    this.setState({ logText: "Your files are ready!" });
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
                this.setState({ percent, logText: "Transcription in progress..." });
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
        }, 20000);
    }

    startTranscription = () => {
        this.setState({ logText: "Transcription in progress..." });
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
                outputFormats: parsed.outputFormats,
                language: parsed.language
            });
        } catch (error) {
            console.error('Configuration loading error:', error);
            alert('Configuration loading error');
        } finally {
            this.setState({ configLoading: false });
        }
    }

    saveConfiguration = async (startTranscription) => {
        const { inputFile, outputFormats, language } = this.state;
        this.setState({ configLoading: true });

        try {
            // Create arguments array
            const args = createArgsArray(inputFile, outputFormats, language);

            // Update whisper service arguments via correct API
            await updateServiceArgs('whisper', args);
            if(startTranscription) this.startTranscription()
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

    handleLanguageChange = (e, { value }) => {
        this.setState({ language: value });
    }

    handleDownload = async (fileName) => {
        try {
            const response = await fetch(`${EXEC_API}/get/${fileName}`);
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
                            onStart={this.uploadStart}
                            onProgress={this.progress} >
                            Drop file here or click me
                        </Upload>
                        <Form>
                            <Form.Field>
                                <label>OR</label>
                                <Input
                                    placeholder="Put http link here.."
                                    value={this.state.inputFile}
                                    onChange={(e) => this.handleInputFileChange(e.target.value)}
                                />

                            </Form.Field>
                        </Form>

                        <Progress label='' percent={this.state.percent} indicating progress='percent' />
                        <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'monospace', marginTop: 10}}>
                             {this.state.logText}
                        </pre>

                        {this.state.logText === "Your files are ready!" && (
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
                        )}

                        {/* Configuration section */}
                        <Segment style={{marginTop: 30}}>
                            <Header as='h3'>Choose You Settings</Header>
                            <Form>

                                <Form.Group widths='equal'>
                                    <Form.Field>
                                        <label>Language</label>
                                        <Dropdown
                                            placeholder='Select language'
                                            fluid
                                            selection
                                            options={this.state.languageOptions}
                                            value={this.state.language}
                                            onChange={this.handleLanguageChange}
                                        />
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
                                    </Form.Field>
                                </Form.Group>

                            </Form>
                        </Segment>

                        <Button key={i + 100} disabled={stButton} size='massive' color='blue' onClick={() => this.saveConfiguration(true)} >
                            Start Transcription
                        </Button>

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
