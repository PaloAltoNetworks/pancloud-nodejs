"use strict";
/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const error_1 = require("./error");
const common_1 = require("./common");
function isIdpResponse(obj) {
    return (typeof obj.access_token == 'string' &&
        typeof obj.expires_in == 'string' &&
        (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string'));
}
function isIdpErrorResponse(obj) {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string');
}
/**
 * The Application Framework Identity Provider URL entry point
 */
const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken';
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken';
const IDP_BASE_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2';
class Credentials {
    constructor(accessToken, expiresIn) {
        this.accessToken = accessToken;
        this.validUntil = Credentials.validUntil(accessToken, expiresIn);
        this.className = "Credentials";
    }
    static validUntil(accessToken, expiresIn) {
        if (expiresIn) {
            return Math.floor(Date.now() / 1000) + expiresIn;
        }
        let exp = 0;
        if (accessToken) {
            let jwtParts = accessToken.split('.');
            if (jwtParts.length != 3) {
                throw new error_1.PanCloudError(EmbeddedCredentials, 'CONFIG', 'invalid JWT Token');
            }
            let claim;
            try {
                claim = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
                exp = Number.parseInt(claim.exp, 10);
            }
            catch (e) {
                throw error_1.PanCloudError.fromError(EmbeddedCredentials, e);
            }
        }
        return exp;
    }
    setAccessToken(accessToken, expiresIn) {
        this.accessToken = accessToken;
        this.validUntil = Credentials.validUntil(accessToken, expiresIn);
    }
    getAccessToken() {
        return this.accessToken;
    }
    getExpiration() {
        return this.validUntil;
    }
    async autoRefresh() {
        if (Date.now() + 300000 > this.validUntil * 1000) {
            try {
                common_1.commonLogger.info(this, 'Attempt to auto-refresh the access token');
                await this.refreshAccessToken();
                return true;
            }
            catch (_a) {
                common_1.commonLogger.info(this, 'Failed to auto-refresh the access token');
            }
        }
        return false;
    }
}
exports.Credentials = Credentials;
/**
 * Embe class keeps data and methods needed to maintain Application Framework access token alive
 */
class EmbeddedCredentials extends Credentials {
    /**
     * class constructor not exposed. You must use the static **EmbeddedCredentials.factory()** instead
     */
    constructor(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn) {
        super(accessToken, expiresIn);
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
        this.idpTokenUrl = idpTokenUrl;
    }
    /**
     * Factory method to instantiate a new **EmbeddedCredentials** class based on the options provided
     * @param opt **CredentialsOptions** class instantiation options
     * @returns a **EmbeddedCredentials** class instantiated either with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` if only the `refresh_token` is provided or fetching
     * a new credential set of the OAUTH2 `code` is provided
     */
    static async factory(opt) {
        if (!opt.idpTokenUrl) {
            opt.idpTokenUrl = IDP_TOKEN_URL;
        }
        if (!(opt.refreshToken || opt.code)) {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'CONFIG', 'Invalid Credentials (code or refresh token missing)');
        }
        if (opt.refreshToken && opt.accessToken) {
            return new EmbeddedCredentials(opt.clientId, opt.clientSecret, opt.accessToken, opt.refreshToken, opt.idpTokenUrl);
        }
        let tk;
        let r_token;
        if (opt.refreshToken) {
            r_token = opt.refreshToken;
            tk = await EmbeddedCredentials.refreshTokens(opt.clientId, opt.clientSecret, opt.refreshToken, opt.idpTokenUrl);
            if (tk.refresh_token) {
                r_token = tk.refresh_token;
            }
        }
        else if (opt.code !== undefined && opt.redirectUri !== undefined) {
            tk = await EmbeddedCredentials.fetchTokens(opt.clientId, opt.clientSecret, opt.code, opt.idpTokenUrl, opt.redirectUri);
            if (tk.refresh_token) {
                r_token = tk.refresh_token;
            }
            else {
                throw new error_1.PanCloudError(EmbeddedCredentials, 'IDENTITY', 'Missing refresh_token in the response');
            }
        }
        else {
            throw new error_1.PanCloudError(EmbeddedCredentials, 'CONFIG', 'Invalid Credentials (code or redirect_uri missing)');
        }
        let exp_in = parseInt(tk.expires_in);
        return new EmbeddedCredentials(opt.clientId, opt.clientSecret, tk.access_token, r_token, opt.idpTokenUrl, exp_in);
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
        let res = await common_1.retrier(EmbeddedCredentials, undefined, undefined, node_fetch_1.default, idpTokenUrl, {
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
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param refreshToken Current OAUTH2 app `refresh_token` value
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    static async refreshTokens(clientId, clientSecret, refreshToken, idpTokenUrl) {
        let res = await common_1.retrier(EmbeddedCredentials, undefined, undefined, node_fetch_1.default, idpTokenUrl, {
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
        let res = await node_fetch_1.default(IDP_REVOKE_URL, {
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
EmbeddedCredentials.className = "EmbeddedCredentials";
exports.EmbeddedCredentials = EmbeddedCredentials;
