"use strict";
/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const error_1 = require("./error");
const common_1 = require("./common");
function isAppFramToken(obj) {
    return (typeof obj.access_token == 'string' &&
        typeof obj.expires_in == 'string' &&
        (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string'));
}
/**
 * The Application Framework Identity Provider URL entry point
 */
const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken';
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken';
const IDP_BASE_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2';
class Credentials {
    constructor(access_token, expires_in) {
        this.access_token = access_token;
        this.valid_until = Credentials.valid_until(access_token, expires_in);
        this.className = "Credentials";
    }
    static valid_until(access_token, expires_in) {
        if (expires_in) {
            return Math.floor(Date.now() / 1000) + expires_in;
        }
        let exp = 0;
        if (access_token) {
            let jwtParts = access_token.split('.');
            if (jwtParts.length != 3) {
                throw new error_1.PanCloudError(embededCredentials, 'CONFIG', 'invalid JWT Token');
            }
            let claim;
            try {
                claim = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
                exp = Number.parseInt(claim.exp, 10);
            }
            catch (e) {
                throw error_1.PanCloudError.fromError(embededCredentials, e);
            }
        }
        return exp;
    }
    set_access_token(access_token, expires_in) {
        this.access_token = access_token;
        this.valid_until = Credentials.valid_until(access_token, expires_in);
    }
    get_access_token() {
        return this.access_token;
    }
    get_expiration() {
        return this.valid_until;
    }
    async autoRefresh() {
        if (Date.now() + 300000 > this.valid_until * 1000) {
            try {
                common_1.commonLogger.info(this, 'Attempt to auto-refresh the access token');
                await this.refresh_access_token();
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
 * Credential class keeps data and methods needed to maintain Application Framework access token alive
 */
class embededCredentials extends Credentials {
    /**
     * class constructor not exposed. You must use the static {@link Credentials.factory} instead
     * @param client_id Mandatory. Application Framework's `client_id` string
     * @param client_secret Mandatory. Application Framework's `client_secret` string
     * @param access_token Optional. If not provided then the factory method will use the `refresh_token` to
     * get a new one at instantiation time.
     * @param refresh_token Mandatory. The factory method also supports fetching the `refresh_token` if the OAUTH2
     * one time code is provided
     * @param idp_token_url Optional. If not provided then the constant {@link IDP_TOKEN_URL} will be used instead
     */
    constructor(client_id, client_secret, access_token, refresh_token, idp_token_url, expires_in) {
        super(access_token, expires_in);
        this.client_id = client_id;
        this.client_secret = client_secret;
        this.refresh_token = refresh_token;
        this.idp_token_url = idp_token_url;
    }
    /**
     * Factory method to instantiate a new {@link Credentials} class based on the options provided
     * @param opt {@link Credentials} class instantiation options
     * @returns a {@link Credentials} class instantiated either with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` if only the `refresh_token` is provided or fetching
     * a new credential set of the OAUTH2 `code` is provided
     */
    static async factory(opt) {
        if (!opt.idp_token_url) {
            opt.idp_token_url = IDP_TOKEN_URL;
        }
        if (!(opt.refresh_token || opt.code)) {
            throw new error_1.PanCloudError(embededCredentials, 'CONFIG', 'Invalid Credentials (code or refresh token missing)');
        }
        if (opt.refresh_token && opt.access_token) {
            return new embededCredentials(opt.client_id, opt.client_secret, opt.access_token, opt.refresh_token, opt.idp_token_url);
        }
        let tk;
        let r_token;
        if (opt.refresh_token) {
            r_token = opt.refresh_token;
            tk = await embededCredentials.refresh_tokens(opt.client_id, opt.client_secret, opt.refresh_token, opt.idp_token_url);
            if (tk.refresh_token) {
                r_token = tk.refresh_token;
            }
        }
        else if (opt.code !== undefined && opt.redirect_uri !== undefined) {
            tk = await embededCredentials.fetch_tokens(opt.client_id, opt.client_secret, opt.code, opt.idp_token_url, opt.redirect_uri);
            if (tk.refresh_token) {
                r_token = tk.refresh_token;
            }
            else {
                throw new error_1.PanCloudError(embededCredentials, 'IDENTITY', 'Missing refresh_token in the response');
            }
        }
        else {
            throw new error_1.PanCloudError(embededCredentials, 'CONFIG', 'Invalid Credentials (code or redirect_uri missing)');
        }
        let exp_in = parseInt(tk.expires_in);
        return new embededCredentials(opt.client_id, opt.client_secret, tk.access_token, r_token, opt.idp_token_url, exp_in);
    }
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @param redirect_uri OAUTH2 app `redirect_uri` callback
     * @returns a new set of tokens
     */
    static async fetch_tokens(client_id, client_secret, code, idp_token_url, redirect_uri) {
        let res = await common_1.retrier(embededCredentials, undefined, undefined, node_fetch_1.default, idp_token_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code": code
            })
        });
        if (!res.ok) {
            throw new error_1.PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP fetch operation ${res.status} ${res.statusText}`);
        }
        let r_json;
        try {
            r_json = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(embededCredentials, 'PARSER', `Invalid JSON fetch response: ${exception.message}`);
        }
        if (isAppFramToken(r_json)) {
            common_1.commonLogger.info(embededCredentials, 'Authorization token successfully retrieved');
            return r_json;
        }
        throw new error_1.PanCloudError(embededCredentials, 'PARSER', `Unparseable response received from IDP fetch operation: "${JSON.stringify(r_json)}"`);
    }
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param refresh_token Current OAUTH2 app `refresh_token` value
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    static async refresh_tokens(client_id, client_secret, refresh_token, idp_token_url) {
        let res = await common_1.retrier(embededCredentials, undefined, undefined, node_fetch_1.default, idp_token_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }),
            timeout: 30000
        });
        if (!res.ok) {
            throw new error_1.PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
        }
        let r_json;
        try {
            r_json = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(embededCredentials, 'PARSER', `Invalid JSON refresh response: ${exception.message}`);
        }
        if (isAppFramToken(r_json)) {
            common_1.commonLogger.info(embededCredentials, 'Authorization token successfully retrieved', 'IDENTITY');
            return r_json;
        }
        throw new error_1.PanCloudError(embededCredentials, 'PARSER', `Unparseable response received from IDP refresh operation: "${JSON.stringify(r_json)}"`);
    }
    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    async refresh_access_token() {
        let tk = await embededCredentials.refresh_tokens(this.client_id, this.client_secret, this.refresh_token, this.idp_token_url);
        this.set_access_token(tk.access_token, parseInt(tk.expires_in));
        if (tk.refresh_token) {
            this.refresh_token = tk.refresh_token;
        }
    }
    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    async revoke_tokens() {
        if (!this.refresh_token) {
            throw new error_1.PanCloudError(embededCredentials, 'CONFIG', `Not valid refresh token for revoke op: ${this.refresh_token}`);
        }
        let res = await node_fetch_1.default(IDP_REVOKE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.client_id,
                "client_secret": this.client_secret,
                "token": this.refresh_token,
                "token_type_hint": "refresh_token"
            })
        });
        if (res.ok && res.size > 0) {
            common_1.commonLogger.info(embededCredentials, 'Credentials(): Authorization token successfully revoked', 'IDENTITY');
        }
        throw new error_1.PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
    }
}
embededCredentials.className = "embededCredentials";
exports.embededCredentials = embededCredentials;
