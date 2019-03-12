import { Credentials } from './credentials';
export interface CredentialsItem {
    accessToken: string;
    validUntil: number;
    datalakeId: string;
}
export interface RefreshResult {
    accessToken: string;
    validUntil: number;
}
export interface CredentialProviderOptions {
    idpTokenUrl?: string;
    idpRevokeUrl?: string;
    accTokenGuardTime?: number;
    retrierAttempts?: number;
    retrierDelay?: number;
}
export declare abstract class CortexCredentialProvider {
    private clientId;
    private clientSecret;
    private idpTokenUrl;
    private idpRevokeUrl;
    private credentials;
    private credentialsRefreshToken;
    private credentialsObject;
    private retrierAttempts?;
    private retrierDelay?;
    private accTokenGuardTime;
    className: string;
    protected constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
    });
    private idpInterface;
    /**
     * Implements the Cortex Datalake OAUTH2 refresh token operation
     */
    private refreshAccessToken;
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    private fetchTokens;
    private restoreState;
    deleteDatalake(datalakeId: string): Promise<void>;
    registerDatalake(datalakeId: string, code: string, redirectUri: string): Promise<Credentials>;
    issueCredentialsObject(datalakeId: string): Promise<Credentials>;
    retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult>;
    private parseIdpResponse;
    protected abstract createCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>;
    protected abstract updateCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>;
    protected abstract deleteCortexRefreshToken(datalakeId: string): Promise<void>;
    protected abstract retrieveCortexRefreshToken(datalakeId: string): Promise<string>;
    protected abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected abstract deleteCredentialsItem(datalakeId: string): Promise<void>;
    protected abstract loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    protected abstract credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
export declare function defaultCredentialsFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
}): Promise<Credentials>;
