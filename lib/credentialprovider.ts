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

import { retrier, commonLogger, EntryPoint } from './common'
import { PanCloudError } from './error'
import { Credentials } from './credentials'
import { fetch, FetchOptions } from './fetch'
import { env } from 'process'

const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const ACCESS_GUARD = 300 // 5 minutes

/**
 * Represents an raw Cortex IDP credential set 
 */
interface IdpResponse {
    access_token: string, // access token
    refresh_token?: string, // refresh token
    expires_in: string // expiration in seconds
}

/**
 * Cortex credential set with additional `validUntil` field
 */
export type AugmentedIdpResponse = IdpResponse & { validUntil: number }

interface IdpErrorResponse {
    error: string
    error_description: string
}

/**
 * SDK Representation of a Cortex credential set
 */
export interface CredentialsItem {
    accessToken: string
    validUntil: number
    entryPoint: EntryPoint
    refreshToken: string
    datalakeId: string
}

/**
 * Conveniente type guard to check an object against the `CredentialsItem` interface
 * @param obj object to check
 */
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

/**
 * Represents an raw Cortex ID refresh response
 */
export interface RefreshResult {
    accessToken: string
    validUntil: number
}

/**
 * Configuration options for a `CortexCredentialProvider` class
 */
export interface CredentialProviderOptions {
    /**
     * IDP Token Operation Entry Point. Defaults to `https://api.paloaltonetworks.com/api/oauth2/RequestToken`
     */
    idpTokenUrl?: string
    /**
     * IDP Token Revoke Entry Point. Defaults to `https://api.paloaltonetworks.com/api/oauth2/RevokeToken`
     */
    idpRevokeUrl?: string
    /**
     * How soon to expiration before the access token is automatically refreshed. Defaults to `300` (5 minutes)
     */
    accTokenGuardTime?: number
    /**
     * How many attempts to contact IDP before giving up. Defaults to `3`
     */
    retrierAttempts?: number
    /**
     * How many milliseconds to wait between retry attempts. Defauls to `100` milliseconds
     */
    retrierDelay?: number
}

/**
 * Abstract class to provide credentials for multiple datalakes. If you want to extend this class
 * then you must implement its storage-related methods. *T* describes the type of the optional
 * metadata that can be attached to any datalake's credentials
 */
export abstract class CortexCredentialProvider<T, K extends keyof T> {
    private clientId: string
    private clientSecret: string
    private idpTokenUrl: string
    private idpRevokeUrl: string
    protected credentials: {
        [dlid: string]: CredentialsItem
    }
    private credentialsObject: { [dlid: string]: Credentials }
    private retrierAttempts?: number
    private retrierDelay?: number
    private accTokenGuardTime: number
    protected tenantKey?: K
    static className = 'CortexCredentialProvider'

    /**
     * Class constructor
     * @param ops constructor options. Mandatory fields being OAUTH2 `clientId` and `clientSecret`
     * @param tenantKey metadata feature, if used, mult solve at least the multi tenancy use case. That means that the metadata
     * object of type `T` must include a property `K` that could be used for tenant membership identification
     */
    protected constructor(ops: CredentialProviderOptions & {
        clientId: string, clientSecret: string, idpAuthUrl?: string
    }, tenantKey?: K) {
        this.clientId = ops.clientId
        this.clientSecret = ops.clientSecret
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD
        this.retrierAttempts = ops.retrierAttempts
        this.retrierDelay = ops.retrierDelay
        this.tenantKey = tenantKey
        if (this.accTokenGuardTime > 3300) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`)
        }
    }

    /**
     * @returns this CredentialProvider class OAUTH2 `[clientId, clientSecret]`
     */
    getSecrets(): [string, string] {
        return [this.clientId, this.clientSecret]
    }

    /**
     * Do not use this method unless you know what you're doing. It is exposed because `CortexHubHelper`
     * subclasses need it
     */
    async idpRefresh(param: string | FetchOptions): Promise<AugmentedIdpResponse> {
        let res = await retrier(CortexCredentialProvider, this.retrierAttempts, this.retrierDelay, fetch, this.idpTokenUrl, param)
        if (!res.ok) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid JSON refresh response: ${exception.message}`)
        }
        if (isIdpErrorResponse(rJson)) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', rJson.error_description)
        }
        try {
            let augmentedResponse = this.parseIdpResponse(rJson)
            commonLogger.info(CortexCredentialProvider, 'Authorization token successfully retrieved', 'IDENTITY')
            return augmentedResponse
        } catch {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Unparseable response received from IDP refresh operation: '${JSON.stringify(rJson)}'`)
        }
    }

    private async idpRevoke(url: string, param: FetchOptions): Promise<void> {
        let res = await retrier(CortexCredentialProvider, this.retrierAttempts, this.retrierDelay, fetch, url, param)
        if (!res.ok) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid JSON revoke response: ${exception.message}`)
        }
        if (rJson.issuccess && typeof rJson.issuccess == 'string' && rJson.issuccess == 'true') {
            return
        }
        throw JSON.stringify(rJson)
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
        return this.idpRefresh(param)
    }

    private async restoreState(): Promise<void> {
        this.credentials = await this.loadCredentialsDb()
        this.credentialsObject = {}
        for (let dlake of Object.entries(this.credentials)) {
            this.credentialsObject[dlake[0]] = await this.credentialsObjectFactory(
                dlake[0], dlake[1].entryPoint, this.accTokenGuardTime)
        }
        commonLogger.info(CortexCredentialProvider, `Successfully restored ${Object.keys(this.credentials).length} items`)
    }

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
    async issueWithRefreshToken(datalakeId: string, entryPoint: EntryPoint,
        refreshToken: string, prefetch?: { accessToken: string, validUntil: number }, metadata?: T): Promise<Credentials> {
        if (metadata !== undefined && this.tenantKey === undefined) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', 'Metadata provided without proper initialization of the tenantKey property. Review your subclass constructor.')
        }
        if (!this.credentials) {
            await this.restoreState()
        }
        let accessToken: string
        let validUntil: number
        if (prefetch) {
            ({ accessToken, validUntil } = prefetch)
        } else {
            let idpResponse = await this.refreshAccessToken(refreshToken)
            if (idpResponse.refresh_token) {
                refreshToken = idpResponse.refresh_token
                commonLogger.info(CortexCredentialProvider, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`)
            }
            ({ access_token: accessToken, validUntil } = idpResponse)
            commonLogger.info(CortexCredentialProvider, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`)
        }
        let credItem: CredentialsItem = {
            accessToken: accessToken,
            refreshToken: refreshToken,
            entryPoint: entryPoint,
            datalakeId: datalakeId,
            validUntil: validUntil,
        }
        this.credentials[datalakeId] = credItem

        let credentialsObject = await this.credentialsObjectFactory(datalakeId, entryPoint, this.accTokenGuardTime, {
            accessToken: accessToken,
            validUntil: validUntil
        })

        this.credentialsObject[datalakeId] = credentialsObject
        await this.createCredentialsItem(datalakeId, credItem, metadata)
        commonLogger.info(CortexCredentialProvider, `Issued new Credentials Object for datalake ID ${datalakeId}`)
        return credentialsObject
    }

    /**
     * Registers a datalake using its `refresh_token` value and returns a Credentials object bound
     * to it
     * @param datalakeId ID for this datalake
     * @param entryPoint Cortex Datalake regional entry point
     * @param refreshToken OAUTH2 `refresh_token` value
     */
    async registerManualDatalake(
        datalakeId: string, entryPoint: EntryPoint, refreshToken: string,
        prefetch?: { accessToken: string, validUntil: number }, metadata?: T): Promise<Credentials> {
        return this.issueWithRefreshToken(datalakeId, entryPoint, refreshToken, prefetch, metadata)
    }

    /**
     * Retrieves the Credentials object for a given datalake
     * @param datalakeId ID of the datalake the Credentials object should be bound to
     */
    async getCredentialsObject(datalakeId: string): Promise<Credentials> {
        if (this.credentials === undefined || this.credentials[datalakeId] === undefined) {
            await this.restoreState()
        }
        if (!this.credentialsObject[datalakeId]) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG',
                `Record for datalake ${datalakeId} not available. Did you forget to register the refresh token?`)
        }
        commonLogger.info(CortexCredentialProvider, `Providing cached credentials object for datalake ID ${datalakeId}`)
        return this.credentialsObject[datalakeId]
    }

    /**
     * Removes a datalake (revokes its OAUTH2 `refresh_token` as well)
     * @param datalakeId ID of the datalake to be removed
     */
    async deleteDatalake(datalakeId: string): Promise<void> {
        if (this.credentials === undefined || this.credentials[datalakeId] === undefined) {
            await this.restoreState()
        }
        if (this.credentials[datalakeId] === undefined) {
            commonLogger.info(CortexCredentialProvider, `Request to delete a non existant datalake ${datalakeId}. Ignoring it`)
            return
        }
        let param: FetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "token": this.credentials[datalakeId].refreshToken,
                "token_type_hint": "refresh_token"
            })
        }
        try {
            await this.idpRevoke(this.idpRevokeUrl, param)
            commonLogger.info(CortexCredentialProvider, `Successfully revoked refresh token for datalake ${datalakeId}`)
        } catch (e) {
            commonLogger.alert(CortexCredentialProvider, `Non expected revoke response received by IDP ${e}`)
        }
        delete this.credentials[datalakeId]
        await this.deleteCredentialsItem(datalakeId)
        delete this.credentialsObject[datalakeId]
    }

    /**
     * Main method used by a bound Credentials object. Returns the current `access_token` and its
     * expiration time. It auto-refreshes the `access_token` if needed based on the `accTokenGuardTime`
     * class configuration option
     * @param datalakeId ID of the datalake to obtain `access_token` from
     */
    async retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult> {
        if (this.credentials === undefined || this.credentials[datalakeId] === undefined) {
            await this.restoreState()
        }
        if (!(datalakeId in this.credentials)) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', `Datalake ${datalakeId} not in database`)
        }
        let credentials = this.credentials[datalakeId]
        if (Date.now() + this.accTokenGuardTime * 1000 > credentials.validUntil * 1000) {
            commonLogger.info(CortexCredentialProvider, 'Asking for a new access_token')
            let idpResponse = await this.refreshAccessToken(credentials.refreshToken)
            credentials.accessToken = idpResponse.access_token
            credentials.validUntil = idpResponse.validUntil
            if (idpResponse.refresh_token) {
                credentials.refreshToken = idpResponse.refresh_token
                commonLogger.info(CortexCredentialProvider, 'Received new Cortex Refresh Token')
            }
            await this.updateCredentialsItem(datalakeId, credentials)
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
        throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid response received by IDP provider`)
    }

    /**
     * Returns a basic `Credentials` subclass that just calls this provider's `retrieveCortexAccessToken`
     * method when a new access_token is needed.
     * @param datalakeId The datalake we want a credentials object for
     * @param entryPoint The Cortex Datalake regional API entry point
     * @param accTokenGuardTime Amount of seconds before expiration credentials object should use cached value
     * @param prefetch Optinal prefetched access_token
     */
    protected async defaultCredentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        let credObject = new DefaultCredentials(datalakeId, entryPoint, accTokenGuardTime, this, prefetch)
        commonLogger.info(CortexCredentialProvider, `Instantiated new credential object from the factory for datalake id ${datalakeId}`)
        return credObject
    }

    /**
     * Implementation dependant. It is called by the abstract class each time a new set of credenentials have been
     * created (either by manual refresh or by OAUTH2 code grant flow handled by a `CortexHubHelper` companion).
     * The implementator is expected to store them somewhere
     * @param datalakeId datalake identificator
     * @param credentialsItem credential attributes
     * @param metadata optional metadata (used by multitenant applications to attach tenant ID)
     */
    protected abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem, metadata?: T): Promise<void>

    /**
     * Implementation dependant. It is called by the abstract class when a refresh token operation returns not
     * only a new access_token but a new refresh_token as well. The implementator is expected to update the record
     * @param datalakeId datalake identificator
     * @param credentialsItem credential attributes
     */
    protected abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>

    /**
     * Implementation dependant. It is called by the abstract class as a response to a successful revocation of
     * the refresh_token. The implementator is expected to delete the record from the store
     * @param datalakeId datalake identificator
     */
    protected abstract deleteCredentialsItem(datalakeId: string): Promise<void>

    /**
     * Convenience method to allow a companion `CortexHubHelper` object retrieve metadata previously stored.
     * Most implementations will return only these records matching the provided metadata (use case: to get
     * all activated datalake ID's for a specific tenant)
     */
    abstract selectDatalakeByTenant(tenantId: T[K]): Promise<string[]>

    /**
     * Implementation dependant. Expected to load all records from the store
     */
    protected abstract loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }>

    /**
     * Implementation dependant. Its purpose is to initialize and return a suitable credentials object from this
     * credential provider for the specific datalake and attached attributes
     * @param datalakeId The datalake we want a credentials object for
     * @param entryPoint The Cortex Datalake regional API entry point
     * @param accTokenGuardTime Amount of seconds before expiration credentials object should use cached value
     * @param prefetch Optinal prefetched access_token
     */
    protected abstract credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials>
}

class DefaultCredentialsProvider extends CortexCredentialProvider<never, never> {
    private sequence: number
    className = 'DefaultCredentialsProvider'

    constructor(ops: CredentialProviderOptions & { clientId: string, clientSecret: string }) {
        super(ops)
        this.sequence = Math.floor(Date.now() * Math.random())
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

    selectDatalakeByTenant(tenantId: never): Promise<string[]> {
        commonLogger.info(this, 'Stateless credential provider. Do not support credentials metadata')
        return Promise.resolve([])
    }

    protected async loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }> {
        commonLogger.info(this, 'Stateless credential provider. Returning an empty item list to load() request')
        return {}
    }

    protected credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        return this.defaultCredentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch)
    }
}

class DefaultCredentials<T, K extends keyof T> extends Credentials {
    accessTokenSupplier: CortexCredentialProvider<T, K>
    datalakeId: string

    constructor(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, supplier: CortexCredentialProvider<T, K>,
        prefetch?: { accessToken: string, validUntil: number }) {
        super(entryPoint, accTokenGuardTime)
        this.datalakeId = datalakeId
        this.accessTokenSupplier = supplier
        if (prefetch) {
            this.setAccessToken(prefetch.accessToken, prefetch.validUntil)
        }
        this.className = 'DefaultCredentials'
    }

    async retrieveAccessToken(): Promise<void> {
        let refreshObj = await this.accessTokenSupplier.retrieveCortexAccessToken(this.datalakeId)
        this.setAccessToken(refreshObj.accessToken, refreshObj.validUntil)
        commonLogger.info(this, `Successfully cached a new access token for datalake ID ${this.datalakeId}`)
    }
}

const ENV_PREFIX = 'PAN'

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
export async function defaultCredentialsProviderFactory(ops?: CredentialProviderOptions & {
    envPrefix?: string
    clientId?: string,
    clientSecret?: string,
    refreshToken?: string,
    entryPoint?: EntryPoint
}): Promise<Credentials> {
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX
    let envClientId = `${ePrefix}_CLIENT_ID`
    let envClientSecret = `${ePrefix}_CLIENT_SECRET`
    let envDefaultRefreshToken = `${ePrefix}_REFRESH_TOKEN`
    let envEntryPoint = `${ePrefix}_ENTRYPOINT`
    let cId = (ops && ops.clientId) ? ops.clientId : env[envClientId]
    if (!cId) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientId} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_id'`)
    let cSec = (ops && ops.clientSecret) ? ops.clientSecret : env[envClientSecret]
    if (!cSec) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientSecret} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret'`)
    let rTok = (ops && ops.refreshToken) ? ops.refreshToken : env[envDefaultRefreshToken]
    if (!rTok) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envDefaultRefreshToken} not found or empty value`)
    }
    let entryPoint = (ops && ops.entryPoint) ? ops.entryPoint : (env[envEntryPoint] as EntryPoint)
    if (!entryPoint) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envEntryPoint} not found or empty value`)
    }
    return new DefaultCredentialsProvider({
        clientId: cId,
        clientSecret: cSec,
        ...ops
    }).registerManualDatalake('DEFAULT', entryPoint, rTok)
}