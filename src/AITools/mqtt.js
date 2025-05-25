import mqtt from "mqtt";
import {randomString} from "./tools";
import {MQTT_URL} from "./consts";

class MqttMsg {
    constructor() {
        this.user = null;
        this.mq = null;
        this.connected = false;
        this.room = null;
        this.token = null;
    }

    init = (user, callback) => {
        this.user = user;

        const transformUrl = (url, options, client) => {
            client.options.password = this.token;
            return url;
        };

        let options = {
            keepalive: 10,
            connectTimeout: 10 * 1000,
            clientId: "test-" + randomString(3),
            protocolId: "MQTT",
            protocolVersion: 5,
            clean: true,
            username: "test@name",
            password: this.token,
            transformWsUrl: transformUrl,
            properties: {
                maximumPacketSize: 10000,
                requestResponseInformation: true,
                requestProblemInformation: true,
            },
        };

        this.mq = mqtt.connect(`wss://${MQTT_URL}`, options);

        this.mq.on("connect", (data) => {
            if (data && !this.connected) {
                console.log("[mqtt] Connected to server: ", data);
                this.connected = true;
                callback(data);
            } else {
                console.error("[mqtt] Connected to server: ", data);
            }
        });

        this.mq.on("error", (data) => console.error("[mqtt] Error: ", data));
        this.mq.on("disconnect", (data) => console.error("[mqtt] Disconnect: ", data));
        this.mq.on("close", (data) => console.error("[mqtt] Close: ", data));
        this.mq.on("end", () => console.warn("[mqtt] End: "));
        this.mq.on("reconnect", () => console.warn("[mqtt] Reconnect: "));
        this.mq.on("offline", () => console.warn("[mqtt] Offline: "));
        this.mq.on("outgoingEmpty", () => console.warn("[mqtt] OutgoingEmpty: "));

        // this.mq.on("packetsend", (data) => console.debug("[mqtt] PacketSend: ", data));
        // this.mq.on("packetreceive", (data) => {
        //     console.debug("[mqtt] PacketReceive: ", data);
        //     if(data.reasonCode === 135) {
        //         console.error("[mqtt] Auth Error: ", data);
        //         //window.location.reload();
        //     }
        // });

    };

    join = (topic) => {
        if (!this.mq) return;
        console.log("[mqtt] Subscribe to: ", topic);
        let options = {qos: 1, nl: true};
        this.mq.subscribe(topic, {...options}, (err) => {
            err && console.error("[mqtt] Error: ", err);
        });
    };

    exit = (topic) => {
        if (!this.mq) return;
        let options = {};
        console.log("[mqtt] Unsubscribe from: ", topic);
        this.mq.unsubscribe(topic, {...options}, (err) => {
            err && console.error("[mqtt] Error: ", err);
        });
    };

    send = (message, retain, topic) => {
        if (!this.mq) return;
        console.log("[mqtt] Send data on topic: ", topic, message);
        let options = {qos: 1, retain, properties: {messageExpiryInterval: 0, userProperties: this.user}};
        this.mq.publish(topic, message, {...options}, (err) => {
            err && console.error("[mqtt] Error: ", err);
        });
    };

    watch = (callback) => {
        let message;
        this.mq.on("message", (topic, data, packet) => {
            try {
                message = JSON.parse(data.toString());
            } catch (e) {
                //console.error(e);
                //console.error("[mqtt] Not valid JSON, ", data.toString());
                console.log("[mqtt] Got data on topic: ", topic, data.toString());
                return;
            }
            console.log("[mqtt] Got data on topic: ", topic, message);
            callback(message, topic);

        });
    };

    setToken = (token) => {
        this.token = token;
    };
}

const defaultMqtt = new MqttMsg();

export default defaultMqtt;
