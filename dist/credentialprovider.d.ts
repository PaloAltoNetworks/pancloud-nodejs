import { EntryPoint, OAUTH2SCOPE } from './common';
import { Credentials } from './credentials';
export interface CredentialsItem {
    accessToken: string;
    validUntil: number;
    datalakeId: string;
}
export declare function isCredentialItem(obj: any): obj is CredentialsItem;
export interface RefreshResult {
    accessToken: string;
    validUntil: number;
}
export interface CortexClientParams<T> {
    instance_id: string;
    instance_name?: string;
    location?: {
        region: string;
        entryPoint?: EntryPoint;
    };
    lsn?: string;
    customFields?: T;
}
export interface CredentialProviderOptions {
    idpTokenUrl?: string;
    idpRevokeUrl?: string;
    idpAuthUrl?: string;
    accTokenGuardTime?: number;
    retrierAttempts?: number;
    retrierDelay?: number;
}
export declare abstract class CortexCredentialProvider<T> {
    private clientId;
    private clientSecret;
    private idpTokenUrl;
    private idpRevokeUrl;
    private idpAuthUrl;
    protected credentials: {
        [dlid: string]: CredentialsItem;
    };
    protected credentialsRefreshToken: {
        [dlid: string]: string;
    };
    private credentialsObject;
    private retrierAttempts?;
    private retrierDelay?;
    private accTokenGuardTime;
    static className: string;
    protected constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
    });
    private idpRefresh;
    private idpRevoke;
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
    private settleCredObject;
    private issueWithRefreshToken;
    registerCodeDatalake(code: string, state: string, redirectUri: string): Promise<Credentials>;
    registerManualDatalake(datalakeId: string, refreshToken: string): Promise<Credentials>;
    issueCredentialsObject(datalakeId: string): Promise<Credentials>;
    deleteDatalake(datalakeId: string): Promise<void>;
    retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult>;
    private parseIdpResponse;
    idpAuthRequest(redirectUri: string, scope: OAUTH2SCOPE[], datalakeId: string, clientParams: CortexClientParams<T>): Promise<URL>;
    paramsParser(queryString: string): CortexClientParams<T>;
    protected defaultCredentialsObjectFactory(datalakeId: string, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
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
    protected abstract requestAuthState(datalakeId: string, clientParams: CortexClientParams<T>): Promise<string>;
    protected abstract restoreAuthState(state: string): Promise<{
        datalakeId: string;
        clientParams: CortexClientParams<T>;
    }>;
    protected abstract deleteAuthState(state: string): Promise<void>;
    protected abstract credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
export declare function defaultCredentialsProviderFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
}): Promise<Credentials>;
