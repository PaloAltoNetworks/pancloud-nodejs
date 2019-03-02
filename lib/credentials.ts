/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */

import { PanCloudError } from './error'
import { PancloudClass, commonLogger } from './common'

/**
 * Configuration options to instantiate the credentials class. Find usage in the {@link Credentials} constructor
 */
export interface CredentialsOptions {
    /**
     * If not provided then the constant **IDP_TOKEN_URL** will be used instead
     */
    idpTokenUrl?: string,
}

/**
 * Base abstract CredentialS class 
 */
export abstract class Credentials implements PancloudClass {
    private validUntil: number
    private accessToken: string
    public className: string

    constructor(accessToken: string, expiresIn?: number) {
        this.accessToken = accessToken
        this.validUntil = Credentials.validUntil(accessToken, expiresIn)
        this.className = "Credentials"
    }

    private static validUntil(accessToken?: string, expiresIn?: number): number {
        if (expiresIn) {
            return Math.floor(Date.now() / 1000) + expiresIn
        }
        let exp = 0
        if (accessToken) {
            let jwtParts = accessToken.split('.')
            if (jwtParts.length != 3) { throw new PanCloudError({ className: 'Credentials' }, 'CONFIG', 'invalid JWT Token') }
            let claim: any
            try {
                claim = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString())
                exp = Number.parseInt(claim.exp, 10)
            } catch (e) {
                throw PanCloudError.fromError({ className: 'Credentials' }, e)
            }
        }
        return exp
    }

    protected setAccessToken(accessToken: string, expiresIn?: number) {
        this.accessToken = accessToken
        this.validUntil = Credentials.validUntil(accessToken, expiresIn)
    }

    /**
     * Returns the current access token
     */
    public getAccessToken(): string {
        return this.accessToken
    }

    /**
     * Returns the current access token expiration time
     */
    public getExpiration(): number {
        return this.validUntil
    }

    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    public async autoRefresh(): Promise<boolean> {
        if (Date.now() + 300000 > this.validUntil * 1000) {
            try {
                commonLogger.info(this, 'Attempt to auto-refresh the access token')
                await this.refreshAccessToken()
                return true
            } catch {
                commonLogger.info(this, 'Failed to auto-refresh the access token')
            }
        }
        return false
    }

    /**
     * Triggers an access token refresh request
     */
    public async abstract refreshAccessToken(): Promise<void>

    /**
     * Triggers a refresh token revocation request
     */
    public async abstract revokeToken(): Promise<void>
}
