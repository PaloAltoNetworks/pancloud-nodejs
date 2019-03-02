/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
import { PancloudClass } from './common';
/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface CredentialsOptions {
    /**
     * If not provided then the constant **IDP_TOKEN_URL** will be used instead
     */
    idpTokenUrl?: string;
}
/**
 * Base abstract CredentialS class
 */
export declare abstract class Credentials implements PancloudClass {
    private validUntil;
    private accessToken;
    className: string;
    constructor(accessToken: string, expiresIn?: number);
    private static validUntil;
    protected setAccessToken(accessToken: string, expiresIn?: number): void;
    /**
     * Returns the current access token
     */
    getAccessToken(): string;
    /**
     * Returns the current access token expiration time
     */
    getExpiration(): number;
    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    autoRefresh(): Promise<boolean>;
    /**
     * Triggers an access token refresh request
     */
    abstract refreshAccessToken(): Promise<void>;
    /**
     * Triggers a refresh token revocation request
     */
    abstract revokeToken(): Promise<void>;
}
