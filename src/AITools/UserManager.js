import Keycloak from 'keycloak-js';
import mqtt from "./mqtt";

const userManagerConfig = {
    url: 'https://accounts.kab.info/auth',
    realm: 'main',
    clientId: 'ai-tools'
};

const initOptions = {
    onLoad: "check-sso",
    checkLoginIframe: false,
    flow: "standard",
    pkceMethod: "S256",
    enableLogging: true
};

export const kc = new Keycloak(userManagerConfig);

kc.onTokenExpired = () => {
    renewToken(0);
};

kc.onAuthLogout = () => {
    console.debug("-- Detect clearToken --");
    //window.location.reload();
    initOptions.onLoad = "login-required";
    kc.init(initOptions).then((a) => {
        if (a) {
            console.log("check-sso", kc)
            console.log("access token: ", kc.token)
            console.log("refresh token: ", kc.refreshToken)
        } else {
            kc.logout();
        }
    })
        .catch((err) => console.error(err));
    //kc.login({redirectUri: window.location.href});
};

const renewToken = (retry) => {
    retry++;
    kc.updateToken(5)
        .then((refreshed) => {
            if (refreshed) {
                console.log("Token updated: ", kc);
                console.log("Refresh token exp : ", kc.refreshTokenParsed.exp - kc.refreshTokenParsed.iat);
                mqtt.setToken(kc.token);
            }
        })
        .catch((err) => {
            console.error(err)
            renewRetry(retry);
        });
};

const renewRetry = (retry) => {
    if (retry > 50) {
        kc.clearToken();
    } else {
        setTimeout(() => {
            renewToken(retry);
        }, 10000);
    }
};

const setData = () => {
    const {realm_access: {roles}, sub, given_name, name, email} = kc.tokenParsed;
    const user = {display: name, email, roles, id: sub, username: given_name};
    mqtt.setToken(kc.token);
    return user;
}

export const getUser = (callback) => {
    kc.init(initOptions)
        .then((authenticated) => {
            if (authenticated) {
                console.log("check-sso", kc)
                console.log("access token: ", kc.token)
                console.log("refresh token: ", kc.refreshToken)
                const user = setData();
                callback(user);
            } else {
                callback(null);
            }
        })
        .catch((err) => callback(null));
};

export default kc;
