interface appFrameworkTokens {
    access_token: string;
    refresh_token?: string;
    expires_in: string;
}
export interface credOptions {
    client_id: string;
    client_secret: string;
    access_token?: string;
    refresh_token?: string;
    idp_token_url?: string;
    redirect_uri?: string;
    code?: string;
}
export declare class Credentials {
    private access_token;
    private refresh_token;
    private client_id;
    private client_secret;
    private idp_token_url;
    private valid_until;
    static className: string;
    private constructor();
    private static expExtractor;
    static factory(opt: credOptions): Promise<Credentials>;
    static fetch_tokens(client_id: string, client_secret: string, code: string, idp_token_url: string, redirect_uri: string): Promise<appFrameworkTokens>;
    static refresh_tokens(client_id: string, client_secret: string, refresh_token: string, idp_token_url: string): Promise<appFrameworkTokens>;
    autoRefresh(): Promise<boolean>;
    get_access_token(): string;
    get_expiration(): number;
    refresh_access_token(): Promise<void>;
    revoke_tokens(): Promise<void>;
}
export {};
