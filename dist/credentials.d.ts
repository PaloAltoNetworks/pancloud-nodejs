/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface CredentialsOptions {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
    idpTokenUrl?: string;
    redirectUri?: string;
    code?: string;
}
export declare abstract class Credentials {
    private validUntil;
    private accessToken;
    className: string;
    constructor(accessToken: string, expiresIn?: number);
    private static validUntil;
    protected setAccessToken(accessToken: string, expiresIn?: number): void;
    getAccessToken(): string;
    getExpiration(): number;
    autoRefresh(): Promise<boolean>;
    abstract refreshAccessToken(): Promise<void>;
    abstract revokeToken(): Promise<void>;
}
/**
 * Credential class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class EmbededCredentials extends Credentials {
    private refreshToken;
    private clientId;
    private clientSecret;
    private idpTokenUrl;
    static className: string;
    /**
     * class constructor not exposed. You must use the static {@link Credentials.factory} instead
     * @param clientId Mandatory. Application Framework's `client_id` string
     * @param clientSecret Mandatory. Application Framework's `client_secret` string
     * @param accessToken Optional. If not provided then the factory method will use the `refresh_token` to
     * get a new one at instantiation time.
     * @param refreshToken Mandatory. The factory method also supports fetching the `refresh_token` if the OAUTH2
     * one time code is provided
     * @param idpTokenUrl Optional. If not provided then the constant {@link IDP_TOKEN_URL} will be used instead
     */
    private constructor();
    /**
     * Factory method to instantiate a new {@link Credentials} class based on the options provided
     * @param opt {@link Credentials} class instantiation options
     * @returns a {@link Credentials} class instantiated either with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` if only the `refresh_token` is provided or fetching
     * a new credential set of the OAUTH2 `code` is provided
     */
    static factory(opt: CredentialsOptions): Promise<Credentials>;
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
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param refresh_token Current OAUTH2 app `refresh_token` value
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    private static refreshTokens;
    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    refreshAccessToken(): Promise<void>;
    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    revokeToken(): Promise<void>;
}
