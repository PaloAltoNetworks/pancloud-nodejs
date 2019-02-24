/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */

import fetch from 'node-fetch';
import { PanCloudError } from './error'
import { commonLogger, retrier } from './common'

/**
 * Represents an Application Framework credential set
 */
interface idpResponse {
    access_token: string, // access token
    refresh_token?: string, // refresh token
    expires_in: string // expiration in seconds
}

function isIdpResponse(obj: any): obj is idpResponse {
    return (typeof obj.access_token == 'string' &&
        typeof obj.expires_in == 'string' &&
        (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string'))
}

interface idpErrorResponse {
    error: string
    error_description: string
}

function isIdpErrorResponse(obj: any): obj is idpErrorResponse {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string')
}

/**
 * The Application Framework Identity Provider URL entry point
 */
const IDP_TOKEN_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const IDP_BASE_URL: string = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'

/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface credOptions {
    client_id: string,
    client_secret: string,
    access_token?: string,
    refresh_token?: string,
    idp_token_url?: string,
    redirect_uri?: string,
    code?: string,
}

export abstract class Credentials {
    private valid_until: number
    private access_token: string
    public className: string

    constructor(access_token: string, expires_in?: number) {
        this.access_token = access_token
        this.valid_until = Credentials.valid_until(access_token, expires_in)
        this.className = "Credentials"
    }

    private static valid_until(access_token?: string, expires_in?: number): number {
        if (expires_in) {
            return Math.floor(Date.now() / 1000) + expires_in
        }
        let exp = 0
        if (access_token) {
            let jwtParts = access_token.split('.')
            if (jwtParts.length != 3) { throw new PanCloudError(embededCredentials, 'CONFIG', 'invalid JWT Token') }
            let claim: any
            try {
                claim = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString())
                exp = Number.parseInt(claim.exp, 10)
            } catch (e) {
                throw PanCloudError.fromError(embededCredentials, e)
            }
        }
        return exp
    }

    protected set_access_token(access_token: string, expires_in?: number) {
        this.access_token = access_token
        this.valid_until = Credentials.valid_until(access_token, expires_in)
    }

    public get_access_token(): string {
        return this.access_token
    }

    public get_expiration(): number {
        return this.valid_until
    }

    public async autoRefresh(): Promise<boolean> {
        if (Date.now() + 300000 > this.valid_until * 1000) {
            try {
                commonLogger.info(this, 'Attempt to auto-refresh the access token')
                await this.refresh_access_token()
                return true
            } catch {
                commonLogger.info(this, 'Failed to auto-refresh the access token')
            }
        }
        return false
    }

    public async abstract refresh_access_token(): Promise<void>
    public async abstract revoke_tokens(): Promise<void>
}

/**
 * Credential class keeps data and methods needed to maintain Application Framework access token alive
 */
export class embededCredentials extends Credentials {
    private refresh_token: string
    private client_id: string
    private client_secret: string
    private idp_token_url: string
    static className = "embededCredentials"

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
    private constructor(
        client_id: string, client_secret: string,
        access_token: string, refresh_token: string,
        idp_token_url: string, expires_in?: number) {
        super(access_token, expires_in)
        this.client_id = client_id
        this.client_secret = client_secret
        this.refresh_token = refresh_token
        this.idp_token_url = idp_token_url
    }

    /**
     * Factory method to instantiate a new {@link Credentials} class based on the options provided
     * @param opt {@link Credentials} class instantiation options
     * @returns a {@link Credentials} class instantiated either with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` if only the `refresh_token` is provided or fetching
     * a new credential set of the OAUTH2 `code` is provided
     */
    public static async factory(opt: credOptions): Promise<Credentials> {
        if (!opt.idp_token_url) { opt.idp_token_url = IDP_TOKEN_URL }
        if (!(opt.refresh_token || opt.code)) {
            throw new PanCloudError(embededCredentials, 'CONFIG', 'Invalid Credentials (code or refresh token missing)')
        }
        if (opt.refresh_token && opt.access_token) {
            return new embededCredentials(
                opt.client_id, opt.client_secret,
                opt.access_token, opt.refresh_token,
                opt.idp_token_url)
        }
        let tk: idpResponse
        let r_token: string
        if (opt.refresh_token) {
            r_token = opt.refresh_token
            tk = await embededCredentials.refresh_tokens(opt.client_id, opt.client_secret, opt.refresh_token, opt.idp_token_url)
            if (tk.refresh_token) {
                r_token = tk.refresh_token
            }
        } else if (opt.code !== undefined && opt.redirect_uri !== undefined) {
            tk = await embededCredentials.fetch_tokens(opt.client_id, opt.client_secret, opt.code, opt.idp_token_url, opt.redirect_uri)
            if (tk.refresh_token) {
                r_token = tk.refresh_token
            } else {
                throw new PanCloudError(embededCredentials, 'IDENTITY', 'Missing refresh_token in the response')
            }
        } else {
            throw new PanCloudError(embededCredentials, 'CONFIG', 'Invalid Credentials (code or redirect_uri missing)')
        }
        let exp_in = parseInt(tk.expires_in)
        return new embededCredentials(opt.client_id, opt.client_secret,
            tk.access_token, r_token,
            opt.idp_token_url, exp_in)
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
    private static async fetch_tokens(
        client_id: string,
        client_secret: string,
        code: string,
        idp_token_url: string,
        redirect_uri: string): Promise<idpResponse> {
        let res = await retrier(embededCredentials, undefined, undefined, fetch, idp_token_url, {
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
        })
        if (!res.ok) {
            throw new PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP fetch operation ${res.status} ${res.statusText}`)
        }
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(embededCredentials, 'PARSER', `Invalid JSON fetch response: ${exception.message}`)
        }
        if (isIdpResponse(r_json)) {
            commonLogger.info(embededCredentials, 'Authorization token successfully retrieved')
            return r_json
        }
        if (isIdpErrorResponse(r_json)) {
            throw new PanCloudError(embededCredentials, 'IDENTITY', r_json.error_description)
        }
        throw new PanCloudError(embededCredentials, 'PARSER', `Unparseable response received from IDP fetch operation: "${JSON.stringify(r_json)}"`)
    }

    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param refresh_token Current OAUTH2 app `refresh_token` value
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    private static async refresh_tokens(
        client_id: string,
        client_secret: string,
        refresh_token: string,
        idp_token_url: string): Promise<idpResponse> {
        let res = await retrier(embededCredentials, undefined, undefined, fetch, idp_token_url, {
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
        })
        if (!res.ok) {
            throw new PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
        }
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(embededCredentials, 'PARSER', `Invalid JSON refresh response: ${exception.message}`)
        }
        if (isIdpResponse(r_json)) {
            commonLogger.info(embededCredentials, 'Authorization token successfully retrieved', 'IDENTITY')
            return r_json
        }
        if (isIdpErrorResponse(r_json)) {
            throw new PanCloudError(embededCredentials, 'IDENTITY', r_json.error_description)
        }
        throw new PanCloudError(embededCredentials, 'PARSER', `Unparseable response received from IDP refresh operation: "${JSON.stringify(r_json)}"`)
    }

    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    public async refresh_access_token(): Promise<void> {
        let tk = await embededCredentials.refresh_tokens(this.client_id, this.client_secret, this.refresh_token, this.idp_token_url)
        this.set_access_token(tk.access_token, parseInt(tk.expires_in))
        if (tk.refresh_token) {
            this.refresh_token = tk.refresh_token
        }
    }

    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    public async revoke_tokens(): Promise<void> {
        if (!this.refresh_token) {
            throw new PanCloudError(embededCredentials, 'CONFIG', `Not valid refresh token for revoke op: ${this.refresh_token}`)
        }
        let res = await fetch(IDP_REVOKE_URL, {
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
        })
        if (res.ok && res.size > 0) {
            commonLogger.info(embededCredentials, 'Credentials(): Authorization token successfully revoked', 'IDENTITY');
        }
        throw new PanCloudError(embededCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
    }
}