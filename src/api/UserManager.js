import Keycloak from 'keycloak-js';
import mqtt from "./mqtt";
import {KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID} from "../consts";

const userManagerConfig = {
    url: KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_CLIENT_ID
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

// keycloak-js allows init() only once per instance; later calls reuse its result.
let initPromise = null;

// Called once on app start: check-sso (without a silent-check iframe) redirects the whole page to
// Keycloak and back, which must happen on load -- started from a click, it would wipe the page --
// and the code Keycloak returns in the URL is read only by init().
export const initAuth = () => {
    initPromise ??= kc.init(initOptions);
    return initPromise;
};

export const getUser = (callback) => {
    initAuth()
        .then((authenticated) => {
            if (authenticated) {
                const user = setData();
                callback(user);
            } else {
                callback(null);
            }
        })
        .catch((err) => callback(null));
};

// A fresh access token for API calls, or null when nobody is logged in.
export const getToken = async () => {
    if (!(await initAuth().catch(() => false))) return null;
    await kc.updateToken(30);
    return kc.token;
};

export default kc;
