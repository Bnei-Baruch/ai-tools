import {EXEC_API} from "./consts";
import {kc} from "./UserManager";

export const randomString = (len) => {
    let charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";
    for (let i = 0; i < len; i++) {
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz, randomPoz + 1);
    }
    return randomString;
};

export const getData = (path, cb) => fetch(`${path}`, {
    headers: {'Content-Type': 'application/json'}
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`get ${path}`, ex));

// Methods for working with CONFIG API
export const getConfig = async () => {
    try {
        const response = await fetch(`${EXEC_API}/config`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + kc.token,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            return await response.json();
        } else {
            throw new Error(`Configuration retrieval error: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

export const updateServiceArgs = async (serviceName, args) => {
    try {
        const response = await fetch(`${EXEC_API}/config/service/python/args`, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + kc.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ args })
        });
        
        if (response.ok) {
            return true;
        } else {
            throw new Error(`Service arguments update error: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

export const setConfig = async (config) => {
    try {
        const response = await fetch(`${EXEC_API}/config`, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + kc.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            return true;
        } else {
            throw new Error(`Configuration update error: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

export const deleteConfig = async (key) => {
    try {
        const response = await fetch(`${EXEC_API}/config/${key}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + kc.token
            }
        });

        if (response.ok) {
            return true;
        } else {
            throw new Error(`Configuration deletion error: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

// Methods for working with specific configuration fields
export const updateConfigField = async (key, field, value) => {
    try {
        // Get current configuration
        const currentConfig = await getConfig();

        // Update specific field
        const updatedConfig = {
            ...currentConfig,
            [field]: value
        };

        // Save updated configuration
        await setConfig(updatedConfig);
        return updatedConfig;
    } catch (error) {
        console.error('Field update error:', error);
        throw error;
    }
};

export const getConfigField = async (key, field) => {
    try {
        const config = await getConfig();
        return config[field];
    } catch (error) {
        console.error('Field retrieval error:', error);
        throw error;
    }
};

// Helper functions for working with Args
export const parseArgsFromConfig = (config) => {
    const pythonService = config.Services?.find(service => service.ID === "python");
    if (!pythonService || !pythonService.Args) {
        return { inputFile: 'tmp/input.mp3', outputFormats: ['txt'] };
    }

    const args = pythonService.Args;
    const result = {
        inputFile: 'tmp/input.mp3',
        outputFormats: []
    };

    // Look for --input
    const inputIndex = args.findIndex(arg => arg === '--input');
    if (inputIndex !== -1 && inputIndex + 1 < args.length) {
        result.inputFile = args[inputIndex + 1];
    }

    // Look for --txt and --srt
    if (args.includes('--txt')) {
        result.outputFormats.push('txt');
    }
    if (args.includes('--srt')) {
        result.outputFormats.push('srt');
    }

    // Default to txt if nothing is selected
    if (result.outputFormats.length === 0) {
        result.outputFormats.push('txt');
    }

    return result;
};

export const createArgsArray = (inputFile, outputFormats) => {
    const args = ["whisper_fullfile_cli.py"];
    
    // Add formats
    if (outputFormats.includes('txt')) {
        args.push('--txt');
    }
    if (outputFormats.includes('srt')) {
        args.push('--srt');
    }
    
    // // Add language (can be made configurable later)
    // args.push('--language', 'ru');
    
    // Add input file
    args.push('--input', inputFile);
    
    return args;
};

export const updateArgsInConfig = (config, inputFile, outputFormats) => {
    const updatedConfig = JSON.parse(JSON.stringify(config)); // deep copy
    
    let pythonService = updatedConfig.Services?.find(service => service.ID === "python");
    
    // If service doesn't exist, create it
    if (!pythonService) {
        if (!updatedConfig.Services) {
            updatedConfig.Services = [];
        }
        pythonService = {
            "ID": "python",
            "Name": "python3",
            "Description": "",
            "Args": []
        };
        updatedConfig.Services.push(pythonService);
    }

    // Create new Args array
    pythonService.Args = createArgsArray(inputFile, outputFormats);
    
    return updatedConfig;
};
