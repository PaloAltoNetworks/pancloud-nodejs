import { EntryPoint } from './common';
import { Credentials } from './credentials';
import { FetchOptions } from './fetch';
/**
 * Represents an raw Cortex IDP credential set
 */
interface IdpResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: string;
}
/**
 * Cortex credential set with additional `validUntil` field
 */
export declare type AugmentedIdpResponse = IdpResponse & {
    validUntil: number;
};
/**
 * SDK Representation of a Cortex credential set
 */
export interface CredentialsItem {
    accessToken: string;
    validUntil: number;
    entryPoint: EntryPoint;
    refreshToken: string;
    datalakeId: string;
}
/**
 * Conveniente type guard to check an object against the `CredentialsItem` interface
 * @param obj object to check
 */
export declare function isCredentialItem(obj: any): obj is CredentialsItem;
/**
 * Represents an raw Cortex ID refresh response
 */
export interface RefreshResult {
    accessToken: string;
    validUntil: number;
}
/**
 * Configuration options for a `CortexCredentialProvider` class
 */
export interface CredentialProviderOptions {
    /**
     * IDP Token Operation Entry Point. Defaults to `https://api.paloaltonetworks.com/api/oauth2/RequestToken`
     */
    idpTokenUrl?: string;
    /**
     * IDP Token Revoke Entry Point. Defaults to `https://api.paloaltonetworks.com/api/oauth2/RevokeToken`
     */
    idpRevokeUrl?: string;
    /**
     * How soon to expiration before the access token is automatically refreshed. Defaults to `300` (5 minutes)
     */
    accTokenGuardTime?: number;
    /**
     * How many attempts to contact IDP before giving up. Defaults to `3`
     */
    retrierAttempts?: number;
    /**
     * How many milliseconds to wait between retry attempts. Defauls to `100` milliseconds
     */
    retrierDelay?: number;
}
/**
 * Abstract class to provide credentials for multiple datalakes. If you want to extend this class
 * then you must implement its storage-related methods. *T* describes the type of the optional
 * metadata that can be attached to any datalake's credentials
 */
export declare abstract class CortexCredentialProvider<T, K extends keyof T> {
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
    protected tenantKey?: K;
    static className: string;
    /**
     * Class constructor
     * @param ops constructor options. Mandatory fields being OAUTH2 `clientId` and `clientSecret`
     * @param tenantKey metadata feature, if used, mult solve at least the multi tenancy use case. That means that the metadata
     * object of type `T` must include a property `K` that could be used for tenant membership identification
     */
    protected constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
        idpAuthUrl?: string;
    }, tenantKey?: K);
    /**
     * @returns this CredentialProvider class OAUTH2 `[clientId, clientSecret]`
     */
    getSecrets(): [string, string];
    /**
     * Do not use this method unless you know what you're doing. It is exposed because `CortexHubHelper`
     * subclasses need it
     */
    idpRefresh(param: string | FetchOptions): Promise<AugmentedIdpResponse>;
    private idpRevoke;
    /**
     * Implements the Cortex Datalake OAUTH2 refresh token operation
     */
    private refreshAccessToken;
    private restoreState;
    /**
     * Issues a new credentials object for a datalake you have static access to its `refreshToken`.
     * This is a low-level method. You better use this object's `registerManualDatalake` method or
     * the `authCallbackHandler` method of a `CortexHubHelper` object that eases build multitenant
     * applications
     * @param datalakeId ID for this datalake
     * @param entryPoint Cortex Datalake regional entry point
     * @param refreshToken OAUTH2 `refresh_token` value
     * @param prefetch You can provide the `access_token` and `valid_until` values if you also have
     * access to them to avoid the initial token refresh operation
     */
    issueWithRefreshToken(datalakeId: string, entryPoint: EntryPoint, refreshToken: string, prefetch?: {
        accessToken: string;
        validUntil: number;
    }, metadata?: T): Promise<Credentials>;
    /**
     * Registers a datalake using its `refresh_token` value and returns a Credentials object bound
     * to it
     * @param datalakeId ID for this datalake
     * @param entryPoint Cortex Datalake regional entry point
     * @param refreshToken OAUTH2 `refresh_token` value
     */
    registerManualDatalake(datalakeId: string, entryPoint: EntryPoint, refreshToken: string, prefetch?: {
        accessToken: string;
        validUntil: number;
    }, metadata?: T): Promise<Credentials>;
    /**
     * Retrieves the Credentials object for a given datalake
     * @param datalakeId ID of the datalake the Credentials object should be bound to
     */
    getCredentialsObject(datalakeId: string): Promise<Credentials>;
    /**
     * Removes a datalake (revokes its OAUTH2 `refresh_token` as well)
     * @param datalakeId ID of the datalake to be removed
     */
    deleteDatalake(datalakeId: string): Promise<void>;
    /**
     * Main method used by a bound Credentials object. Returns the current `access_token` and its
     * expiration time. It auto-refreshes the `access_token` if needed based on the `accTokenGuardTime`
     * class configuration option
     * @param datalakeId ID of the datalake to obtain `access_token` from
     */
    retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult>;
    private parseIdpResponse;
    /**
     * Returns a basic `Credentials` subclass that just calls this provider's `retrieveCortexAccessToken`
     * method when a new access_token is needed.
     * @param datalakeId The datalake we want a credentials object for
     * @param entryPoint The Cortex Datalake regional API entry point
     * @param accTokenGuardTime Amount of seconds before expiration credentials object should use cached value
     * @param prefetch Optinal prefetched access_token
     */
    protected defaultCredentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
    /**
     * Implementation dependant. It is called by the abstract class each time a new set of credenentials have been
     * created (either by manual refresh or by OAUTH2 code grant flow handled by a `CortexHubHelper` companion).
     * The implementator is expected to store them somewhere
     * @param datalakeId datalake identificator
     * @param credentialsItem credential attributes
     * @param metadata optional metadata (used by multitenant applications to attach tenant ID)
     */
    protected abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem, metadata?: T): Promise<void>;
    /**
     * Implementation dependant. It is called by the abstract class when a refresh token operation returns not
     * only a new access_token but a new refresh_token as well. The implementator is expected to update the record
     * @param datalakeId datalake identificator
     * @param credentialsItem credential attributes
     */
    protected abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    /**
     * Implementation dependant. It is called by the abstract class as a response to a successful revocation of
     * the refresh_token. The implementator is expected to delete the record from the store
     * @param datalakeId datalake identificator
     */
    protected abstract deleteCredentialsItem(datalakeId: string): Promise<void>;
    /**
     * Convenience method to allow a companion `CortexHubHelper` object retrieve metadata previously stored.
     * Most implementations will return only these records matching the provided metadata (use case: to get
     * all activated datalake ID's for a specific tenant)
     */
    abstract selectDatalakeByTenant(tenantId: T[K]): Promise<string[]>;
    /**
     * Implementation dependant. Expected to load all records from the store
     */
    protected abstract loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    /**
     * Implementation dependant. Its purpose is to initialize and return a suitable credentials object from this
     * credential provider for the specific datalake and attached attributes
     * @param datalakeId The datalake we want a credentials object for
     * @param entryPoint The Cortex Datalake regional API entry point
     * @param accTokenGuardTime Amount of seconds before expiration credentials object should use cached value
     * @param prefetch Optinal prefetched access_token
     */
    protected abstract credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
/**
 * Instantiates a *memory-only* CredentialProvider subclass with only one datalake manually
 * registered. Obtains all configuration values either from provided configuration options or
 * from environmental variables.
 * @param ops.envPrefix environmental variale prefix. Defaults to `PAN`
 * @param ops.clientId OAUTH2 `client_id` value. If not provided will attempt to get it from the
 * `{ops.envPrefix}_CLIENT_ID` environmental variable
 * @param ops.clientSecret OAUTH2 `client_secret` value. If not provided will attempt to get it
 * from the `{ops.envPrefix}_CLIENT_SECRET` environmental variable
 * @param ops.refreshToken OAUTH2 `refresh_token` value. If not provided will attempt to get it
 * from the `{ops.envPrefix}_REFRESH_TOKEN` environmental variable
 * @param ops.entryPoint Cortex Datalake regiona API entrypoint. If not provided will attempt
 * to get it from the `{ops.envPrefix}_ENTRYPOINT` environmental variable
 * @returns a Credentials object bound to the provided `refres_token`
 */
export declare function defaultCredentialsProviderFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    entryPoint?: EntryPoint;
}): Promise<Credentials>;
export {};
