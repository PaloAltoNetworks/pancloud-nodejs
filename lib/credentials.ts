// Copyright 2015-2019 Palo Alto Networks, Inc
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */

import { PancloudClass, EntryPoint, commonLogger } from './common'
import { PanCloudError } from './error';

/**
 * Base abstract CredentialS class 
 */
export abstract class Credentials implements PancloudClass {
    private validUntil: number
    private entryPoint: EntryPoint
    private accessToken: string
    public className: string
    private guardTime: number

    constructor(entryPoint: EntryPoint, guardTime?: number) {
        this.entryPoint = entryPoint
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

    public getEntryPoint(): EntryPoint {
        return this.entryPoint
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

class StaticCredentials extends Credentials {
    constructor(entryPoint: EntryPoint, accessToken: string) {
        super(entryPoint)
        this.className = 'StaticCredentials'
        let parts = accessToken.split('.')
        if (parts.length != 3) {
            throw new PanCloudError(this, 'CONFIG', 'not a valid JWT access token')
        }
        let validUntil = 0
        try {
            let claim = JSON.parse(Buffer.from(parts[1], 'base64').toString())
            if (!(claim.exp && typeof claim.exp == 'number')) {
                throw new PanCloudError(this, 'CONFIG', `JWT claim does not include "exp" field (${parts[1]})`)
            }
            validUntil = claim.exp
        } catch (e) {
            throw new PanCloudError(this, 'PARSER', 'Unable to decode the JWT access token')
        }
        this.setAccessToken(accessToken, validUntil)
    }

    retrieveAccessToken(): Promise<void> {
        commonLogger.info(this, 'This is a static credentials class. Do not support refresh operations.')
        return Promise.resolve()
    }
}

/**
 * Initializes a static (meant to be used for testing and quick starting) Credentials object. Please
 * note that the returned object won't refresh the token at all.
 * @param entryPoint Cortex Hub regional API entry point
 * @param accessToken OAUTH2 `access_token` value.
 */
export function defaultCredentialsFactory(entryPoint: EntryPoint, accessToken: string): Credentials {
    return new StaticCredentials(entryPoint, accessToken)
}