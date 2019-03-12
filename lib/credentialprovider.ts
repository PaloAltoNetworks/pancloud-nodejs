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

import { retrier, commonLogger } from './common'
import { PanCloudError } from './error'
import { Credentials } from './credentials'
import { fetch, FetchOptions } from './fetch'
import { env } from 'process'

const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const ACCESS_GUARD = 300 // 5 minutes

/**
 * Represents an Application Framework credential set
 */
interface IdpResponse {
    access_token: string, // access token
    refresh_token?: string, // refresh token
    expires_in: string // expiration in seconds
}

type AugmentedIdpResponse = IdpResponse & { validUntil: number }

interface IdpErrorResponse {
    error: string
    error_description: string
}

export interface CredentialsItem {
    accessToken: string
    validUntil: number
    datalakeId: string
}

export function isCredentialItem(obj: any): obj is CredentialsItem {
    return typeof obj == 'object' &&
        obj.accessToken && typeof obj.accessToken == 'string' &&
        obj.validUntil && typeof obj.validUntil == 'number' &&
        obj.datalakeId && typeof obj.datalakeId == 'string'
}

function isIdpErrorResponse(obj: any): obj is IdpErrorResponse {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string')
}

export interface RefreshResult {
    accessToken: string
    validUntil: number
}

export interface CredentialProviderOptions {
    idpTokenUrl?: string
    idpRevokeUrl?: string
    accTokenGuardTime?: number
    retrierAttempts?: number
    retrierDelay?: number
}

export abstract class CortexCredentialProvider {
    private clientId: string
    private clientSecret: string
    private idpTokenUrl: string
    private idpRevokeUrl: string
    protected credentials: {
        [dlid: string]: CredentialsItem
    }
    protected credentialsRefreshToken: { [dlid: string]: string }
    private credentialsObject: { [dlid: string]: Credentials }
    private retrierAttempts?: number
    private retrierDelay?: number
    private accTokenGuardTime: number
    className = 'CortexCredentialProvider'

    protected constructor(ops: CredentialProviderOptions & { clientId: string, clientSecret: string }) {
        this.clientId = ops.clientId
        this.clientSecret = ops.clientSecret
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD
        this.retrierAttempts = ops.retrierAttempts
        this.retrierDelay = ops.retrierDelay
        if (this.accTokenGuardTime > 3300) {
            throw new PanCloudError(this, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`)
        }
    }

    private async idpInterface(url: string, param: string | FetchOptions): Promise<AugmentedIdpResponse> {
        let res = await retrier(this, this.retrierAttempts, this.retrierDelay, fetch, url, param)
        if (!res.ok) {
            throw new PanCloudError(this, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(this, 'PARSER', `Invalid JSON refresh response: ${exception.message}`)
        }
        if (isIdpErrorResponse(rJson)) {
            throw new PanCloudError(this, 'IDENTITY', rJson.error_description)
        }
        try {
            let augmentedResponse = this.parseIdpResponse(rJson)
            commonLogger.info(this, 'Authorization token successfully retrieved', 'IDENTITY')
            return augmentedResponse
        } catch {
            throw new PanCloudError(this, 'PARSER', `Unparseable response received from IDP refresh operation: '${JSON.stringify(rJson)}'`)
        }
    }

    /**
     * Implements the Cortex Datalake OAUTH2 refresh token operation
     */
    private refreshAccessToken(refreshToken: string): Promise<AugmentedIdpResponse> {
        let param: FetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "refresh_token": refreshToken,
                "grant_type": "refresh_token"
            }),
            timeout: 30000
        }
        return this.idpInterface(this.idpTokenUrl, param)
    }

    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    private fetchTokens(code: string, redirectUri: string): Promise<AugmentedIdpResponse> {
        let param: FetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "redirect_uri": redirectUri,
                "grant_type": "authorization_code",
                "code": code
            })
        }
        return this.idpInterface(this.idpTokenUrl, param)
    }

    private async restoreState(): Promise<void> {
        this.credentials = await this.loadCredentialsDb()
        this.credentialsObject = {}
        this.credentialsRefreshToken = {}
        for (let datalakeId in this.credentials) {
            this.credentialsRefreshToken[datalakeId] = await this.retrieveCortexRefreshToken(datalakeId)
            this.credentialsObject[datalakeId] = await this.credentialsObjectFactory(datalakeId, this.accTokenGuardTime)
        }
        commonLogger.info(this, `Successfully restored ${Object.keys(this.credentials).length} items`)
    }

    async deleteDatalake(datalakeId: string): Promise<void> {
        let param: FetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "token": this.credentialsRefreshToken[datalakeId],
                "token_type_hint": "refresh_token"
            })
        }
        await this.idpInterface(this.idpRevokeUrl, param)
        delete this.credentialsRefreshToken[datalakeId]
        await this.deleteCortexRefreshToken(datalakeId)
        delete this.credentials[datalakeId]
        await this.deleteCredentialsItem(datalakeId)
        delete this.credentialsObject[datalakeId]
    }

    private async settleCredObject(datalakeId: string, accessToken: string, validUntil: number): Promise<Credentials> {
        let credentialsObject = await this.credentialsObjectFactory(datalakeId, this.accTokenGuardTime, {
            accessToken: accessToken,
            validUntil: validUntil
        })
        let credItem: CredentialsItem = {
            accessToken: accessToken,
            datalakeId: datalakeId,
            validUntil: validUntil,
        }
        this.credentials[datalakeId] = credItem
        this.credentialsObject[datalakeId] = credentialsObject
        await this.createCredentialsItem(datalakeId, credItem)
        commonLogger.info(this, `Issued new Credentials Object for datalake ID ${datalakeId}`)
        return credentialsObject
    }

    async registerCodeDatalake(datalakeId: string, code: string, redirectUri: string): Promise<Credentials> {
        let idpResponse = await this.fetchTokens(code, redirectUri)
        if (!idpResponse.refresh_token) {
            throw new PanCloudError(this, 'IDENTITY', 'Identity response does not include a refresh token')
        }
        this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token
        this.createCortexRefreshToken(datalakeId, idpResponse.refresh_token)
        commonLogger.info(this, `Successfully registered code for datalake ID ${datalakeId} with Identity Provider`)
        return this.settleCredObject(datalakeId, idpResponse.access_token, idpResponse.validUntil)
    }

    private async issueWithRefreshToken(datalakeId: string, refreshToken: string, create = false): Promise<Credentials> {
        this.credentialsRefreshToken[datalakeId] = refreshToken
        if (create) {
            this.createCortexRefreshToken(datalakeId, refreshToken)
        }
        let idpResponse = await this.refreshAccessToken(refreshToken)
        if (idpResponse.refresh_token) {
            this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token
            commonLogger.info(this, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`)
            await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token)
        }
        commonLogger.info(this, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`)
        return this.settleCredObject(datalakeId, idpResponse.access_token, idpResponse.validUntil)
    }

    registerManualDatalake(datalakeId: string, refreshToken: string): Promise<Credentials> {
        return this.issueWithRefreshToken(datalakeId, refreshToken, true)
    }

    async issueCredentialsObject(datalakeId: string): Promise<Credentials> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (this.credentials[datalakeId]) {
            commonLogger.info(this, `Providing cached credentials object for datalake ID ${datalakeId}`)
            return this.credentialsObject[datalakeId]
        }
        let refreshToken = await this.retrieveCortexRefreshToken(datalakeId)
        commonLogger.info(this, `Retrieved Cortex Refresh Token for datalake ID ${datalakeId} from Store`)
        return this.issueWithRefreshToken(datalakeId, refreshToken)
    }

    async retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (!(datalakeId in this.credentials)) {
            throw new PanCloudError(this, 'IDENTITY', `Datalake ${datalakeId} not in database`)
        }
        let credentials = this.credentials[datalakeId]
        if (Date.now() + this.accTokenGuardTime * 1000 > credentials.validUntil * 1000) {
            try {
                commonLogger.info(this, 'Asking for a new access_token')
                let idpResponse = await this.refreshAccessToken(this.credentialsRefreshToken[datalakeId])
                credentials.accessToken = idpResponse.access_token
                credentials.validUntil = idpResponse.validUntil
                if (idpResponse.refresh_token) {
                    this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token
                    commonLogger.info(this, 'Received new Cortex Refresh Token')
                    await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token)
                }
                await this.updateCredentialsItem(datalakeId, credentials)
            } catch {
                commonLogger.info(this, 'Failed to get a new access token')
            }
        }
        return {
            accessToken: credentials.accessToken,
            validUntil: credentials.validUntil
        }
    }

    private parseIdpResponse(obj: any): AugmentedIdpResponse {
        if (typeof obj.access_token == 'string' &&
            typeof obj.expires_in == 'string' &&
            (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string')) {
            let expiresIn = Number.parseInt(obj.expires_in)
            if (!isNaN(expiresIn)) {
                return {
                    validUntil: Math.floor(Date.now() / 1000) + expiresIn,
                    ...obj
                }
            }
        }
        throw new PanCloudError(this, 'PARSER', `Invalid response received by IDP provider`)
    }

    protected async defaultCredentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        let credObject = new DefaultCredentials(datalakeId, accTokenGuardTime, this)
        if (prefetch) {
            credObject.putAccessToken(prefetch.accessToken, prefetch.validUntil)
        }
        commonLogger.info(this, `Issued a new credential object from the factory for datalake id ${datalakeId}`)
        return credObject
    }

    protected async abstract createCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>
    protected async abstract updateCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>
    protected async abstract deleteCortexRefreshToken(datalakeId: string): Promise<void>
    protected async abstract retrieveCortexRefreshToken(datalakeId: string): Promise<string>
    protected async abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>
    protected async abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>
    protected async abstract deleteCredentialsItem(datalakeId: string): Promise<void>
    protected async abstract loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }>
    protected async abstract credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials>
}

class DefaultCredentialsProvider extends CortexCredentialProvider {
    private envPrefix: string
    className = 'DefaultCredentialsProvider'

    constructor(ops: CredentialProviderOptions & { clientId: string, clientSecret: string, envPrefix: string }) {
        super(ops)
        this.envPrefix = ops.envPrefix
    }

    protected createCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void> {
        return this.updateCortexRefreshToken(datalakeId, refreshToken)
    }

    protected async updateCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void> {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`
        env[environmentVariable] = refreshToken
        commonLogger.info(this, `Updated environment variable ${environmentVariable} with new refresh token`)
    }

    protected async deleteCortexRefreshToken(datalakeId: string): Promise<void> {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`
        delete env[environmentVariable]
        commonLogger.info(this, `Deleted environment variable ${environmentVariable}`)
    }

    protected async retrieveCortexRefreshToken(datalakeId: string): Promise<string> {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`
        let refreshToken = env[environmentVariable]
        if (!refreshToken) {
            throw new PanCloudError(this, 'CONFIG', `Environment variable ${environmentVariable} not found or empty value`)
        }
        commonLogger.info(this, `Retrieved refresh token for datalake id ${datalakeId} from environment variable ${environmentVariable}`)
        return refreshToken
    }

    protected async createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void> {
        commonLogger.info(this, 'Stateless credential provider. Discarding new item issued')
    }

    protected async updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void> {
        commonLogger.info(this, 'Stateless credential provider. Discarding updated item')
    }

    protected async deleteCredentialsItem(datalakeId: string): Promise<void> {
        commonLogger.info(this, 'Stateless credential provider. Discarding deleted item')
    }

    protected async loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }> {
        commonLogger.info(this, 'Stateless credential provider. Returning an empty item list to load() request')
        return {}
    }

    protected credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch)
    }
}

class DefaultCredentials extends Credentials {
    accessTokenSupplier: CortexCredentialProvider
    datalakeId: string

    constructor(datalakeId: string, accTokenGuardTime: number, supplier: CortexCredentialProvider) {
        super(accTokenGuardTime)
        this.datalakeId = datalakeId
        this.accessTokenSupplier = supplier
        this.className = 'DefaultCredentials'
    }

    async retrieveAccessToken(): Promise<void> {
        let refreshObj = await this.accessTokenSupplier.retrieveCortexAccessToken(this.datalakeId)
        this.setAccessToken(refreshObj.accessToken, refreshObj.validUntil)
        commonLogger.info(this, `Successfully cached a new access token for datalake ID ${this.datalakeId}`)
    }

    putAccessToken(accessToken: string, validUntil: number): void {
        return this.setAccessToken(accessToken, validUntil)
    }
}

const ENV_PREFIX = 'PAN'

export async function defaultCredentialsFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string
    clientId?: string,
    clientSecret?: string
}): Promise<Credentials> {
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX
    let envClientId = `${ePrefix}_MASTER_CLIENTID`
    let envClientSecret = `${ePrefix}_MASTER_CLIENTSECRET`
    let cId = (ops && ops.clientId) ? ops.clientId : env[envClientId]
    if (!cId) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientId} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_id' from environment variable ${envClientId}`)
    let cSec = (ops && ops.clientSecret) ? ops.clientSecret : env[envClientSecret]
    if (!cSec) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientSecret} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret' from environment variable ${envClientSecret}`)
    return new DefaultCredentialsProvider({
        envPrefix: ePrefix,
        clientId: cId,
        clientSecret: cSec,
        ...ops
    }).issueCredentialsObject('DEFAULT')
}