/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */

import { PancloudClass, commonLogger } from './common'
import { PanCloudError } from './error';

/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface CredentialsOptions {
    /**
     * If not provided then the constant **IDP_TOKEN_URL** will be used instead
     */
    idpTokenUrl?: string,
    guardTime?: number
}

/**
 * Base abstract CredentialS class 
 */
export abstract class Credentials implements PancloudClass {
    private validUntil: number
    private accessToken: string
    public className: string
    private guardTime: number

    constructor(guardTime?: number) {
        this.guardTime = (guardTime) ? guardTime : 300
        this.className = "Credentials"
        if (this.guardTime > 3300) {
            throw new PanCloudError(this, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.guardTime})`)
        }
    }

    protected setAccessToken(accessToken: string, validUntil: number) {
        this.accessToken = accessToken
        this.validUntil = validUntil
    }

    /**
     * Returns the current access token
     */
    public async getAccessToken(): Promise<string> {
        if (!this.accessToken) {
            await this.retrieveAccessToken()
        }
        return this.accessToken
    }

    public async getExpiration(): Promise<number> {
        if (!this.accessToken) {
            await this.retrieveAccessToken()
        }
        return this.validUntil
    }

    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    public async autoRefresh(): Promise<boolean> {
        if (!this.accessToken) {
            await this.retrieveAccessToken()
        }
        if (Date.now() + this.guardTime * 1000 > this.validUntil * 1000) {
            try {
                commonLogger.info(this, 'Cached access token about to expire. Requesting a new one.')
                await this.retrieveAccessToken()
                return true
            } catch {
                commonLogger.info(this, 'Failed to get a new access token')
            }
        }
        return false
    }

    /**
     * Triggers an access token refresh request
     */
    public async abstract retrieveAccessToken(): Promise<void>
}
