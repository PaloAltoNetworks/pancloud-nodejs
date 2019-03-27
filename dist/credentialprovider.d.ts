import { EntryPoint } from './common';
import { Credentials } from './credentials';
import { FetchOptions } from './fetch';
/**
 * Represents an Application Framework credential set
 */
interface IdpResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: string;
}
export declare type AugmentedIdpResponse = IdpResponse & {
    validUntil: number;
};
export interface CredentialsItem {
    accessToken: string;
    validUntil: number;
    entryPoint: EntryPoint;
    refreshToken: string;
    datalakeId: string;
}
export declare function isCredentialItem(obj: any): obj is CredentialsItem;
export interface RefreshResult {
    accessToken: string;
    validUntil: number;
}
export interface CredentialProviderOptions {
    idpTokenUrl?: string;
    idpRevokeUrl?: string;
    idpCallbackUrl?: string;
    accTokenGuardTime?: number;
    retrierAttempts?: number;
    retrierDelay?: number;
}
export declare abstract class CortexCredentialProvider {
    private clientId;
    private clientSecret;
    private idpTokenUrl;
    private idpRevokeUrl;
    protected credentials: {
        [dlid: string]: CredentialsItem;
    };
    private credentialsObject;
    private retrierAttempts?;
    private retrierDelay?;
    private accTokenGuardTime;
    static className: string;
    protected constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
        idpAuthUrl?: string;
    });
    getSecrets(): [string, string];
    idpRefresh(param: string | FetchOptions): Promise<AugmentedIdpResponse>;
    private idpRevoke;
    /**
     * Implements the Cortex Datalake OAUTH2 refresh token operation
     */
    private refreshAccessToken;
    private restoreState;
    issueWithRefreshToken(datalakeId: string, entryPoint: EntryPoint, refreshToken: string): Promise<Credentials>;
    registerManualDatalake(datalakeId: string, entryPoint: EntryPoint, refreshToken: string): Promise<Credentials>;
    getCredentialsObject(datalakeId: string): Promise<Credentials>;
    deleteDatalake(datalakeId: string): Promise<void>;
    retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult>;
    private parseIdpResponse;
    protected defaultCredentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
    protected abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected abstract deleteCredentialsItem(datalakeId: string): Promise<void>;
    protected abstract loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    protected abstract credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
export declare function defaultCredentialsProviderFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    entryPoint?: EntryPoint;
}): Promise<Credentials>;
export {};
