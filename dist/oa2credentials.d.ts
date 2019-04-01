import { Credentials, CredentialsOptions } from './credentials';
/**
 * Represents an Application Framework credential set
 */
interface IdpResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: string;
}
interface OA2BaseCredentialsOptions extends CredentialsOptions {
    /**
     * Application Framework's `client_id` string
     */
    clientId: string;
    /**
     * Application Framework's `client_secret` string
     */
    clientSecret: string;
}
declare abstract class OA2BaseCredentials extends Credentials {
    private refreshToken;
    private clientId;
    private clientSecret;
    private idpTokenUrl;
    static className: string;
    protected constructor(clientId: string, clientSecret: string, accessToken: string, refreshToken: string, idpTokenUrl: string, expiresIn?: number);
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param refreshToken Current OAUTH2 app `refresh_token` value
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    protected static refreshTokens(clientId: string, clientSecret: string, refreshToken: string, idpTokenUrl: string): Promise<IdpResponse>;
    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    refreshAccessToken(): Promise<void>;
    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    revokeToken(): Promise<void>;
}
/**
 * Options to factorize an EmbeddedCredentials class object
 */
export interface EmbeddedCredentialsOptions extends OA2BaseCredentialsOptions {
    /**
     * The access_token if available. Otherwise it will be auto-grenerated from the refresh_token
     */
    accessToken?: string;
    /**
     * Application Framework's `refresh_token` string
     */
    refreshToken: string;
}
/**
 * EmbeddedCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class EmbeddedCredentials extends OA2BaseCredentials {
    static className: string;
    /**
     * class constructor not exposed. You must use the static **EmbeddedCredentials.factory()** instead
     */
    private constructor();
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **CredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` using the provided `refresh_token`
     */
    static factory(opt: EmbeddedCredentialsOptions): Promise<Credentials>;
}
/**
 * Options to factorize an OA2CodeCredentials class object
 */
export interface OA2CodeCredentialsOptions extends OA2BaseCredentialsOptions {
    /**
     * One time code (valid for 60 seconds) to be exchange for tokens from the Identity Provider
     */
    code: string;
    /**
     * Redirect URI that was registered in the manifest file
     */
    redirectUri: string;
}
/**
 * OA2CodeCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class OA2CodeCredentials extends OA2BaseCredentials {
    static className: string;
    /**
     * class constructor not exposed. You must use the static **OA2CodeCredentials.factory()** instead
     */
    private constructor();
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **OA2CodeCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with a new credential set of the OAUTH2 `code` is provided
     */
    static factory(opt: OA2CodeCredentialsOptions): Promise<Credentials>;
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param clientId OAUTH2 app `client_id`
     * @param clientSecret OAUTH2 app `client_secret`
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param idpTokenUrl OAUTH2 Identity Provider URL entry point
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     * @returns a new set of tokens
     */
    private static fetchTokens;
}
/**
 * Options to factorize an EnvCredentials class object
 */
export interface EnvCredentialsOptions extends CredentialsOptions {
    /**
     * Environmental variable containing the `refresh_token`
     */
    envRefreshToken?: string;
    /**
     * Environmental variable containing the `client_id`
     */
    envClientId?: string;
    /**
     * Environmental variable containing the `client_secret`
     */
    envClientSecret?: string;
}
/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class EnvCredentials extends OA2BaseCredentials {
    static className: string;
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`,
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * environmental variables
     */
    static factory(opt?: EnvCredentialsOptions): Promise<Credentials>;
}
/**
 * Options to factorize an FileCredentials class object
 */
export interface FileCredentialsOptions extends CredentialsOptions {
    /**
     * Filename containing the credentials. Defaults to 'credentials.json'
     */
    fileName?: string;
    /**
     * Profile to process. Defaults to '1'
     */
    profile?: string;
    /**
     * File content encoding: Defaults to 'utf8'
     */
    fileEncoding?: string;
}
/**
 * EnvCredentials class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class FileCredentials extends OA2BaseCredentials {
    static className: string;
    /**
     * Factory method to instantiate a new **Credentials** class based on the options provided
     * @param opt object of **EnvCredentialsOptions** class with instantiation options
     * @returns a **Credentials** class instantiated with the provided `client_id`, `client_secret`,
     * `access_token` and `refresh_token` or fetching a fresh `access_token` getting values from
     * a credentials file
     */
    static factory(opt?: FileCredentialsOptions): Promise<Credentials>;
}
export declare class OA2AutoCredentials extends OA2BaseCredentials {
    static className: string;
    static factory(opt?: FileCredentialsOptions | EnvCredentialsOptions): Promise<Credentials>;
}
export {};
