/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface credOptions {
    client_id: string;
    client_secret: string;
    access_token?: string;
    refresh_token?: string;
    idp_token_url?: string;
    redirect_uri?: string;
    code?: string;
}
/**
 * Credential class keeps data and methods needed to maintain Application Framework access token alive
 */
export declare class Credentials {
    private access_token;
    private refresh_token;
    private client_id;
    private client_secret;
    private idp_token_url;
    private valid_until;
    static className: string;
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
    private constructor();
    private static expExtractor;
    /**
     * Factory method to instantiate a new {@link Credentials} class based on the options provided
     * @param opt {@link Credentials} class instantiation options
     * @returns a {@link Credentials} class instantiated either with the provided `access_token` and
     * `refresh_token` or fetching a fresh `access_token` if only the `refresh_token` is provided or fetching
     * a new credential set of the OAUTH2 `code` is provided
     */
    static factory(opt: credOptions): Promise<Credentials>;
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @param redirect_uri OAUTH2 app `redirect_uri` callback
     * @returns a new set of tokens
     */
    private static fetch_tokens;
    /**
     * Implements the Application Framework OAUTH2 refresh token operation
     * @param client_id OAUTH2 app `client_id`
     * @param client_secret OAUTH2 app `client_secret`
     * @param refresh_token Current OAUTH2 app `refresh_token` value
     * @param idp_token_url OAUTH2 Identity Provider URL entry point
     * @returns a new set of tokens
     */
    private static refresh_tokens;
    /**
     * Checks if the current `access_token` is expired or close to expire (5 minutes guard) and
     * tries to refresh it if needed
     * @returns True if successfully refreshed
     */
    autoRefresh(): Promise<boolean>;
    /**
     * @returns current `access_token` value
     */
    get_access_token(): string;
    /**
     * @returns UNIX timestamp of current `access_token` expiration
     */
    get_expiration(): number;
    /**
     * Attempts to refresh the current `access_token`. It might throw exceptions
     */
    refresh_access_token(): Promise<void>;
    /**
     * Use this method when a customer is unsubscribing the OAUTH2 application to revoke the granted `refresh_token`
     */
    revoke_tokens(): Promise<void>;
}
