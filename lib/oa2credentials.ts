/**
 * The Application Framework Identity Provider URL entry point
 */
import fetch from 'node-fetch';
import { commonLogger, retrier } from './common'
import { PanCloudError } from './error'
import { Credentials, CredentialsOptions } from './credentials'
import { env } from 'process'
import { readFileSync } from 'fs'
import { type } from 'os';

const IDP_TOKEN_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const IDP_BASE_URL: string = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'

/**
 * Represents an Application Framework credential set
 */
interface IdpResponse {
    access_token: string, // access token
    refresh_token?: string, // refresh token
    expires_in: string // expiration in seconds
}

function isIdpResponse(obj: any): obj is IdpResponse {
    return (typeof obj.access_token == 'string' &&
        typeof obj.expires_in == 'string' &&
        (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string'))
}

interface IdpErrorResponse {
    error: string
    error_description: string
}

function isIdpErrorResponse(obj: any): obj is IdpErrorResponse {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string')
}

interface OA2BaseCredentialsOptions extends CredentialsOptions {
    /**
     * Application Framework's `client_id` string
     */
    clientId: string,
    /**
     * Application Framework's `client_secret` string
     */
    clientSecret: string,
}

abstract class OA2BaseCredentials extends Credentials {
    private refreshToken: string
    private clientId: string
    private clientSecret: string
    private idpTokenUrl: string
    static className = "OA2BaseCredentials"

    protected constructor(
        clientId: string, clientSecret: string,
        accessToken: string, refreshToken: string,
        idpTokenUrl: string, expiresIn?: number) {
        super(accessToken, expiresIn)
        this.clientId = clientId
        this.clientSecret = clientSecret
        this.refreshToken = refreshToken
        this.idpTokenUrl = idpTokenUrl
    }

    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param refreshToken Current OAUTH2 app `refresh_token` value
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    protected static async refreshTokens(
        clientId: string,
        clientSecret: string,
        refreshToken: string,
        idpTokenUrl: string): Promise<IdpResponse> {
        let res = await retrier(EmbeddedCredentials, undefined, undefined, fetch, idpTokenUrl, {
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
        })
        if (!res.ok) {
            throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(EmbeddedCredentials, 'PARSER', `Invalid JSON refresh response: ${exception.message}`)
        }
        if (isIdpResponse(rJson)) {
            commonLogger.info(EmbeddedCredentials, 'Authorization token successfully retrieved', 'IDENTITY')
            return rJson
        }
        if (isIdpErrorResponse(rJson)) {
            throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', rJson.error_description)
        }
        throw new PanCloudError(EmbeddedCredentials, 'PARSER', `Unparseable response received from IDP refresh operation: "${JSON.stringify(rJson)}"`)
    }

    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    public async refreshAccessToken(): Promise<void> {
        let tk = await EmbeddedCredentials.refreshTokens(this.clientId, this.clientSecret, this.refreshToken, this.idpTokenUrl)
        this.setAccessToken(tk.access_token, parseInt(tk.expires_in))
        if (tk.refresh_token) {
            this.refreshToken = tk.refresh_token
        }
    }

    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    public async revokeToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new PanCloudError(EmbeddedCredentials, 'CONFIG', `Not valid refresh token for revoke op: ${this.refreshToken}`)
        }
        let res = await fetch(IDP_REVOKE_URL, {
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
        })
        if (res.ok && res.size > 0) {
            commonLogger.info(EmbeddedCredentials, 'Credentials(): Authorization token successfully revoked', 'IDENTITY');
        }
        throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
    }
}

/**
 * Options to factorize an EmbeddedCredentials class object
 */
export interface EmbeddedCredentialsOptions extends OA2BaseCredentialsOptions {
    /**
     * The access_token if available. Otherwise it will be auto-grenerated from the refresh_token
     */
    accessToken?: string,
    /**
     * Application Framework's `refresh_token` string
     */
    refreshToken: string,
}

/**
 * EmbeddedCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export class EmbeddedCredentials extends OA2BaseCredentials {
    static className = "EmbeddedCredentials"

    /**
     * class constructor not exposed. You must use the static **EmbeddedCredentials.factory()** instead
     */
    private constructor(
        clientId: string, clientSecret: string,
        accessToken: string, refreshToken: string,
        idpTokenUrl: string, expiresIn?: number
    ) {
        super(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn)
    }

    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **CredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` using the provided `refresh_token`
     */
    public static async factory(opt: EmbeddedCredentialsOptions): Promise<Credentials> {
        let idpTokenUrl = (opt.idpTokenUrl) ? opt.idpTokenUrl : IDP_TOKEN_URL
        if (opt.refreshToken && opt.accessToken) {
            return new EmbeddedCredentials(
                opt.clientId, opt.clientSecret,
                opt.accessToken, opt.refreshToken,
                idpTokenUrl)
        }
        let tk: IdpResponse
        let refreshToken = opt.refreshToken
        tk = await EmbeddedCredentials.refreshTokens(opt.clientId, opt.clientSecret, opt.refreshToken, idpTokenUrl)
        if (tk.refresh_token) {
            refreshToken = tk.refresh_token
        }
        let exp_in = parseInt(tk.expires_in)
        return new EmbeddedCredentials(opt.clientId, opt.clientSecret,
            tk.access_token, refreshToken,
            idpTokenUrl, exp_in)
    }
}

/**
 * Options to factorize an OA2CodeCredentials class object
 */
export interface OA2CodeCredentialsOptions extends OA2BaseCredentialsOptions {
    /**
     * One time code (valid for 60 seconds) to be exchange for tokens from the Identity Provider
     */
    code: string,
    /**
     * Redirect URI that was registered in the manifest file
     */
    redirectUri: string
}

/**
 * OA2CodeCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export class OA2CodeCredentials extends OA2BaseCredentials {
    static className = "OA2CodeCredentials"

    /**
     * class constructor not exposed. You must use the static **OA2CodeCredentials.factory()** instead
     */
    private constructor(
        clientId: string, clientSecret: string,
        accessToken: string, refreshToken: string,
        idpTokenUrl: string, expiresIn?: number
    ) {
        super(clientId, clientSecret, accessToken, refreshToken, idpTokenUrl, expiresIn)
    }

    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **OA2CodeCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with a new credential set of the OAUTH2 `code` is provided
     */
    public static async factory(opt: OA2CodeCredentialsOptions): Promise<Credentials> {
        let idpTokenUrl = (opt.idpTokenUrl) ? opt.idpTokenUrl : IDP_TOKEN_URL
        let refreshToken: string
        let tk = await OA2CodeCredentials.fetchTokens(opt.clientId, opt.clientSecret, opt.code, idpTokenUrl, opt.redirectUri)
        if (tk.refresh_token) {
            refreshToken = tk.refresh_token
        } else {
            throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', 'Missing refresh_token in the response')
        }
        let exp_in = parseInt(tk.expires_in)
        return new OA2CodeCredentials(opt.clientId, opt.clientSecret,
            tk.access_token, refreshToken,
            idpTokenUrl, exp_in)
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
    private static async fetchTokens(
        clientId: string,
        clientSecret: string,
        code: string,
        idpTokenUrl: string,
        redirectUri: string): Promise<IdpResponse> {
        let res = await retrier(EmbeddedCredentials, undefined, undefined, fetch, idpTokenUrl, {
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
        })
        if (!res.ok) {
            throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', `HTTP Error from IDP fetch operation ${res.status} ${res.statusText}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(EmbeddedCredentials, 'PARSER', `Invalid JSON fetch response: ${exception.message}`)
        }
        if (isIdpResponse(rJson)) {
            commonLogger.info(EmbeddedCredentials, 'Authorization token successfully retrieved')
            return rJson
        }
        if (isIdpErrorResponse(rJson)) {
            throw new PanCloudError(EmbeddedCredentials, 'IDENTITY', rJson.error_description)
        }
        throw new PanCloudError(EmbeddedCredentials, 'PARSER', `Unparseable response received from IDP fetch operation: "${JSON.stringify(rJson)}"`)
    }
}

const ENV_CLIENT_ID = 'PAN_CLIENT_ID'
const ENV_CLIENT_SECRET = 'PAN_CLIENT_SECRET'
const ENV_REFRESH_TOKEN = 'PAN_REFRESH_TOKEN'

/**
 * Options to factorize an EnvCredentials class object
 */
export interface EnvCredentialsOptions extends CredentialsOptions {
    /**
     * Environmental variable containing the `refresh_token`
     */
    envRefreshToken?: string,
    /**
     * Environmental variable containing the `client_id`
     */
    envClientId?: string,
    /**
     * Environmental variable containing the `client_secret`
     */
    envClientSecret?: string
}

/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export class EnvCredentials extends OA2BaseCredentials {
    static className = "EnvCredentials"

    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`, 
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * environmental variables
     */
    public static async factory(opt?: EnvCredentialsOptions): Promise<Credentials> {
        let clientIdEnv = (opt && opt.envClientId) ? opt.envClientId : ENV_CLIENT_ID
        let clientId = env[clientIdEnv]
        let clientSecretEnv = (opt && opt.envClientSecret) ? opt.envClientSecret : ENV_CLIENT_SECRET
        let clientSecret = env[clientSecretEnv]
        let refreshTokenEnv = (opt && opt.envRefreshToken) ? opt.envRefreshToken : ENV_REFRESH_TOKEN
        let refreshToken = env[refreshTokenEnv]
        if (clientId && clientSecret && refreshToken) return EmbeddedCredentials.factory({
            clientId, clientSecret, refreshToken
        })
        throw new PanCloudError(EnvCredentials, 'PARSER',
            `Enviromental variables (${clientIdEnv}, ${clientSecretEnv}, ${refreshTokenEnv}) not found`)
    }
}

interface credentialsFileContent {
    profiles: {
        [index: string]: {
            client_id: string,
            client_secret: string,
            refresh_token: string,
            access_token?: string, // backwards compatibility with pancloud-sdk-python
            profile?: string // backwards compatibility with pancloud-sdk-python
        }
    }
}

function isCredentialsFileContent(obj: any): obj is credentialsFileContent {
    return obj.profiles && typeof obj.profiles == 'object' &&
        Object.values<any>(obj.profiles).every(x => {
            return x.client_id && typeof x.client_id == 'string' &&
                x.client_secret && typeof x.client_secret == 'string' &&
                x.client_secret && typeof x.client_secret == 'string' &&
                (!(x.access_token) || typeof x.access_token == 'string') &&
                (!(x.profile) || typeof x.profile == 'string')
        })
}

const FILE_CREDENTIALS = 'credentials.json'
const FILE_PROFILE = '1'
const FILE_ENCODING = 'utf8'

/**
 * Options to factorize an FileCredentials class object
 */
export interface FileCredentialsOptions extends CredentialsOptions {
    /**
     * Filename containing the credentials. Defaults to 'credentials.json'
     */
    fileName?: string,
    /**
     * Profile to process. Defaults to '1'
     */
    profile?: string,
    /**
     * File content encoding: Defaults to 'utf8'
     */
    fileEncoding?: string
}

/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export class FileCredentials extends OA2BaseCredentials {
    static className = "FileCredentials"

    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`, 
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * a credentials file
     */
    public static async factory(opt?: FileCredentialsOptions): Promise<Credentials> {
        let fileName = (opt && opt.fileName) ? opt.fileName : FILE_CREDENTIALS
        let fileProfile = (opt && opt.profile) ? opt.profile : FILE_PROFILE
        let fileEncoding = (opt && opt.fileEncoding) ? opt.fileEncoding : FILE_ENCODING

        let fileContent: string
        try {
            fileContent = readFileSync(fileName, { encoding: fileEncoding })
        } catch (e) {
            throw new PanCloudError(FileCredentials, 'PARSER', `Error reading file ${fileName}`)
        }
        let fileContentJson: any
        try {
            fileContentJson = JSON.parse(fileContent)
        } catch (e) {
            throw new PanCloudError(FileCredentials, 'PARSER', `File ${fileName} is not a JSON document`)
        }
        if (isCredentialsFileContent(fileContentJson)) {
            if (fileContentJson.profiles[fileProfile]) {
                return EmbeddedCredentials.factory({
                    clientId: fileContentJson.profiles[fileProfile].client_id,
                    clientSecret: fileContentJson.profiles[fileProfile].client_secret,
                    refreshToken: fileContentJson.profiles[fileProfile].refresh_token,
                    accessToken: fileContentJson.profiles[fileProfile].access_token
                })
            }
            throw new PanCloudError(EnvCredentials, 'PARSER', `Profile '${fileProfile}' not found in ${fileName}`)
        }
        throw new PanCloudError(EnvCredentials, 'PARSER', `Invalid JSON schema in ${fileName}`)
    }
}

export class OA2AutoCredentials extends OA2BaseCredentials {
    static className = "OA2AutoCredentials"

    public static async factory(opt?: FileCredentialsOptions | EnvCredentialsOptions): Promise<Credentials> {
        try {
            return await EnvCredentials.factory(opt)
        } catch {
            commonLogger.info(OA2AutoCredentials, 'Failed to instantiate EnvCredentials class')
        }
        try {
            return await FileCredentials.factory(opt)
        } catch {
            commonLogger.info(OA2AutoCredentials, 'Failed to instantiate FileCredentials class')
        }
        throw new PanCloudError(OA2AutoCredentials, 'PARSER', 'Unable to instantiate a Credentials class')
    }
}