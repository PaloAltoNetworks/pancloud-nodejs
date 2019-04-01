/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
import { PancloudClass, EntryPoint } from './common';
/**
 * Base abstract CredentialS class
 */
export declare abstract class Credentials implements PancloudClass {
    private validUntil;
    private entryPoint;
    private accessToken;
    className: string;
    private guardTime;
    constructor(entryPoint: EntryPoint, guardTime?: number);
    protected setAccessToken(accessToken: string, validUntil: number): void;
    /**
     * Returns the current access token
     */
    getAccessToken(): Promise<string>;
    getExpiration(): Promise<number>;
    getEntryPoint(): EntryPoint;
    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    autoRefresh(): Promise<boolean>;
    /**
     * Triggers an access token refresh request
     */
    abstract retrieveAccessToken(): Promise<void>;
}
/**
 * Initializes a static (meant to be used for testing and quick starting) Credentials object. Please
 * note that the returned object won't refresh the token at all.
 * @param entryPoint Cortex Hub regional API entry point
 * @param accessToken OAUTH2 `access_token` value.
 */
export declare function defaultCredentialsFactory(entryPoint: EntryPoint, accessToken: string): Credentials;
