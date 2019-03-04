"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The Application Framework Identity Provider URL entry point
 */
const fetch_1 = require("./fetch");
const common_1 = require("./common");
const error_1 = require("./error");
const credentials_1 = require("./credentials");
const process_1 = require("process");
const fs_1 = require("fs");
const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken';
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken';
const IDP_BASE_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2';
function isIdpResponse(obj) {
    return (typeof obj.access_token == 'string' &&
        typeof obj.expires_in == 'string' &&
        (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string'));
}
function isIdpErrorResponse(obj) {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string');
}
class OA2BaseCredentials extends credentials_1.Credentials {
    constructor(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn) {
        super(accessToken, expiresIn);
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
        this.idpTokenUrl = idpTokenUrl;
    }
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param refreshToken Current OAUTH2 app `refresh_token` value
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    static async refreshTokens(clientId, clientSecret, refreshToken, idpTokenUrl) {
        let res = await common_1.retrier(EmbeddedCredentials, undefined, undefined, fetch_1.fetch, idpTokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": clientId,
                "client_secret": clientSecret,
                "refresh_token": refreshToken,
                "grant_type": "refresh_token"
            }),
            timeout: 30000
        });
        if (!res.ok) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'PARSER', `Invalid JSON refresh response: ${exception.message}`);
        }
        if (isIdpResponse(rJson)) {
            common_1.commonLogger.info(EmbeddedCredentials, 'Authorization token successfully retrieved', 'IDENTITY');
            return rJson;
        }
        if (isIdpErrorResponse(rJson)) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', rJson.error_description);
        }
        throw new error_1.PanCloudError(EmbeddedCredentials, 'PARSER', `Unparseable response received from IDP refresh operation: "${JSON.stringify(rJson)}"`);
    }
    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    async refreshAccessToken() {
        let tk = await EmbeddedCredentials.refreshTokens(this.clientId, this.clientSecret, this.refreshToken, this.idpTokenUrl);
        this.setAccessToken(tk.access_token, parseInt(tk.expires_in));
        if (tk.refresh_token) {
            this.refreshToken = tk.refresh_token;
        }
    }
    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    async revokeToken() {
        if (!this.refreshToken) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'CONFIG', `Not valid refresh token for revoke op: ${this.refreshToken}`);
        }
        let res = await fetch_1.fetch(IDP_REVOKE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "token": this.refreshToken,
                "token_type_hint": "refresh_token"
            })
        });
        if (res.ok && res.size > 0) {
            common_1.commonLogger.info(EmbeddedCredentials, 'Credentials(): Authorization token successfully revoked', 'IDENTITY');
        }
        throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
    }
}
OA2BaseCredentials.className = "OA2BaseCredentials";
/**
 * EmbeddedCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
class EmbeddedCredentials extends OA2BaseCredentials {
    /**
     * class constructor not exposed. You must use the static **EmbeddedCredentials.factory()** instead
     */
    constructor(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn) {
        super(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn);
    }
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **CredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` using the provided `refresh_token`
     */
    static async factory(opt) {
        let idpTokenUrl = (opt.idpTokenUrl) ? opt.idpTokenUrl : IDP_TOKEN_URL;
        if (opt.refreshToken && opt.accessToken) {
            return new EmbeddedCredentials(opt.clientId, opt.clientSecret, opt.accessToken, opt.refreshToken, idpTokenUrl);
        }
        let tk;
        let refreshToken = opt.refreshToken;
        tk = await EmbeddedCredentials.refreshTokens(opt.clientId, opt.clientSecret, opt.refreshToken, idpTokenUrl);
        if (tk.refresh_token) {
            refreshToken = tk.refresh_token;
        }
        let exp_in = parseInt(tk.expires_in);
        return new EmbeddedCredentials(opt.clientId, opt.clientSecret, tk.access_token, refreshToken, idpTokenUrl, exp_in);
    }
}
EmbeddedCredentials.className = "EmbeddedCredentials";
exports.EmbeddedCredentials = EmbeddedCredentials;
/**
 * OA2CodeCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
class OA2CodeCredentials extends OA2BaseCredentials {
    /**
     * class constructor not exposed. You must use the static **OA2CodeCredentials.factory()** instead
     */
    constructor(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn) {
        super(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn);
    }
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **OA2CodeCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with a new credential set of the OAUTH2 `code` is provided
     */
    static async factory(opt) {
        let idpTokenUrl = (opt.idpTokenUrl) ? opt.idpTokenUrl : IDP_TOKEN_URL;
        let refreshToken;
        let tk = await OA2CodeCredentials.fetchTokens(opt.clientId, opt.clientSecret, opt.code, idpTokenUrl, opt.redirectUri);
        if (tk.refresh_token) {
            refreshToken = tk.refresh_token;
        }
        else {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', 'Missing refresh_token in the response');
        }
        let exp_in = parseInt(tk.expires_in);
        return new OA2CodeCredentials(opt.clientId, opt.clientSecret, tk.access_token, refreshToken, idpTokenUrl, exp_in);
    }
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     * @returns a new set of tokens
     */
    static async fetchTokens(clientId, clientSecret, code, idpTokenUrl, redirectUri) {
        let res = await common_1.retrier(EmbeddedCredentials, undefined, undefined, fetch_1.fetch, idpTokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": clientId,
                "client_secret": clientSecret,
                "redirect_uri": redirectUri,
                "grant_type": "authorization_code",
                "code": code
            })
        });
        if (!res.ok) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP fetch operation ${res.status} ${res.statusText}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'PARSER', `Invalid JSON fetch response: ${exception.message}`);
        }
        if (isIdpResponse(rJson)) {
            common_1.commonLogger.info(EmbeddedCredentials, 'Authorization token successfully retrieved');
            return rJson;
        }
        if (isIdpErrorResponse(rJson)) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', rJson.error_description);
        }
        throw new error_1.PanCloudError(EmbeddedCredentials, 'PARSER', `Unparseable response received from IDP fetch operation: "${JSON.stringify(rJson)}"`);
    }
}
OA2CodeCredentials.className = "OA2CodeCredentials";
exports.OA2CodeCredentials = OA2CodeCredentials;
const ENV_CLIENT_ID = 'PAN_CLIENT_ID';
const ENV_CLIENT_SECRET = 'PAN_CLIENT_SECRET';
const ENV_REFRESH_TOKEN = 'PAN_REFRESH_TOKEN';
/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
class EnvCredentials extends OA2BaseCredentials {
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`,
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * environmental variables
     */
    static async factory(opt) {
        let clientIdEnv = (opt && opt.envClientId) ? opt.envClientId : ENV_CLIENT_ID;
        let clientId = process_1.env[clientIdEnv];
        let clientSecretEnv = (opt && opt.envClientSecret) ? opt.envClientSecret : ENV_CLIENT_SECRET;
        let clientSecret = process_1.env[clientSecretEnv];
        let refreshTokenEnv = (opt && opt.envRefreshToken) ? opt.envRefreshToken : ENV_REFRESH_TOKEN;
        let refreshToken = process_1.env[refreshTokenEnv];
        if (clientId && clientSecret && refreshToken)
            return EmbeddedCredentials.factory({
                clientId, clientSecret, refreshToken
            });
        throw new error_1.PanCloudError(EnvCredentials, 'PARSER', `Enviromental variables (${clientIdEnv}, ${clientSecretEnv}, ${refreshTokenEnv}) not found`);
    }
}
EnvCredentials.className = "EnvCredentials";
exports.EnvCredentials = EnvCredentials;
function isCredentialsFileContent(obj) {
    return obj.profiles && typeof obj.profiles == 'object' &&
        Object.values(obj.profiles).every(x => {
            return x.client_id && typeof x.client_id == 'string' &&
                x.client_secret && typeof x.client_secret == 'string' &&
                x.client_secret && typeof x.client_secret == 'string' &&
                (!(x.access_token) || typeof x.access_token == 'string') &&
                (!(x.profile) || typeof x.profile == 'string');
        });
}
const FILE_CREDENTIALS = 'credentials.json';
const FILE_PROFILE = '1';
const FILE_ENCODING = 'utf8';
/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
class FileCredentials extends OA2BaseCredentials {
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`,
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * a credentials file
     */
    static async factory(opt) {
        let fileName = (opt && opt.fileName) ? opt.fileName : FILE_CREDENTIALS;
        let fileProfile = (opt && opt.profile) ? opt.profile : FILE_PROFILE;
        let fileEncoding = (opt && opt.fileEncoding) ? opt.fileEncoding : FILE_ENCODING;
        let fileContent;
        try {
            fileContent = fs_1.readFileSync(fileName, { encoding: fileEncoding });
        }
        catch (e) {
            throw new error_1.PanCloudError(FileCredentials, 'PARSER', `Error reading file ${fileName}`);
        }
        let fileContentJson;
        try {
            fileContentJson = JSON.parse(fileContent);
        }
        catch (e) {
            throw new error_1.PanCloudError(FileCredentials, 'PARSER', `File ${fileName} is not a JSON document`);
        }
        if (isCredentialsFileContent(fileContentJson)) {
            if (fileContentJson.profiles[fileProfile]) {
                return EmbeddedCredentials.factory({
                    clientId: fileContentJson.profiles[fileProfile].client_id,
                    clientSecret: fileContentJson.profiles[fileProfile].client_secret,
                    refreshToken: fileContentJson.profiles[fileProfile].refresh_token,
                    accessToken: fileContentJson.profiles[fileProfile].access_token
                });
            }
            throw new error_1.PanCloudError(EnvCredentials, 'PARSER', `Profile '${fileProfile}' not found in ${fileName}`);
        }
        throw new error_1.PanCloudError(EnvCredentials, 'PARSER', `Invalid JSON schema in ${fileName}`);
    }
}
FileCredentials.className = "FileCredentials";
exports.FileCredentials = FileCredentials;
class OA2AutoCredentials extends OA2BaseCredentials {
    static async factory(opt) {
        try {
            return await EnvCredentials.factory(opt);
        }
        catch (_a) {
            common_1.commonLogger.info(OA2AutoCredentials, 'Failed to instantiate EnvCredentials class');
        }
        try {
            return await FileCredentials.factory(opt);
        }
        catch (_b) {
            common_1.commonLogger.info(OA2AutoCredentials, 'Failed to instantiate FileCredentials class');
        }
        throw new error_1.PanCloudError(OA2AutoCredentials, 'PARSER', 'Unable to instantiate a Credentials class');
    }
}
OA2AutoCredentials.className = "OA2AutoCredentials";
exports.OA2AutoCredentials = OA2AutoCredentials;
