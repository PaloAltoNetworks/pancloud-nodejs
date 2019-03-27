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

import { retrier, commonLogger, EntryPoint, region2EntryPoint, OAUTH2SCOPE } from './common'
import { PanCloudError } from './error'
import { Credentials } from './credentials'
import { fetch, FetchOptions } from './fetch'
import { env } from 'process'
import { stringify as qsStringify, parse as qsParse } from 'querystring'
import * as express from 'express'
import { URL } from 'url'

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

export type AugmentedIdpResponse = IdpResponse & { validUntil: number }

interface IdpErrorResponse {
    error: string
    error_description: string
}

export interface CredentialsItem {
    accessToken: string
    validUntil: number
    entryPoint: EntryPoint
    refreshToken: string
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
    idpCallbackUrl?: string
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
    private credentialsObject: { [dlid: string]: Credentials }
    private retrierAttempts?: number
    private retrierDelay?: number
    private accTokenGuardTime: number
    static className = 'CortexCredentialProvider'

    protected constructor(ops: CredentialProviderOptions & {
        clientId: string, clientSecret: string, idpAuthUrl?: string
    }) {
        this.clientId = ops.clientId
        this.clientSecret = ops.clientSecret
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD
        this.retrierAttempts = ops.retrierAttempts
        this.retrierDelay = ops.retrierDelay
        if (this.accTokenGuardTime > 3300) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`)
        }
    }

    getSecrets(): [string, string] {
        return [this.clientId, this.clientSecret]
    }

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

    async issueWithRefreshToken(datalakeId: string, entryPoint: EntryPoint, refreshToken: string): Promise<Credentials> {
        if (!this.credentials) {
            await this.restoreState()
        }
        let idpResponse = await this.refreshAccessToken(refreshToken)
        let currentRefreshToken = refreshToken
        if (idpResponse.refresh_token) {
            currentRefreshToken = idpResponse.refresh_token
            commonLogger.info(CortexCredentialProvider, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`)
        }
        commonLogger.info(CortexCredentialProvider, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`)

        let credItem: CredentialsItem = {
            accessToken: idpResponse.access_token,
            refreshToken: currentRefreshToken,
            entryPoint: entryPoint,
            datalakeId: datalakeId,
            validUntil: idpResponse.validUntil,
        }
        this.credentials[datalakeId] = credItem

        let credentialsObject = await this.credentialsObjectFactory(datalakeId, entryPoint, this.accTokenGuardTime, {
            accessToken: idpResponse.access_token,
            validUntil: idpResponse.validUntil
        })

        this.credentialsObject[datalakeId] = credentialsObject
        await this.createCredentialsItem(datalakeId, credItem)
        commonLogger.info(CortexCredentialProvider, `Issued new Credentials Object for datalake ID ${datalakeId}`)
        return credentialsObject
    }

    async registerManualDatalake(datalakeId: string, entryPoint: EntryPoint, refreshToken: string): Promise<Credentials> {
        return this.issueWithRefreshToken(datalakeId, entryPoint, refreshToken)
    }

    async getCredentialsObject(datalakeId: string): Promise<Credentials> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (!this.credentialsObject[datalakeId]) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG',
                `Record for datalake ${datalakeId} not available. Did you forget to register the refresh token?`)
        }
        commonLogger.info(CortexCredentialProvider, `Providing cached credentials object for datalake ID ${datalakeId}`)
        return this.credentialsObject[datalakeId]
    }

    async deleteDatalake(datalakeId: string): Promise<void> {
        if (!this.credentials) {
            await this.restoreState()
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

    async retrieveCortexAccessToken(datalakeId: string): Promise<RefreshResult> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (!(datalakeId in this.credentials)) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', `Datalake ${datalakeId} not in database`)
        }
        let credentials = this.credentials[datalakeId]
        if (Date.now() + this.accTokenGuardTime * 1000 > credentials.validUntil * 1000) {
            try {
                commonLogger.info(CortexCredentialProvider, 'Asking for a new access_token')
                let idpResponse = await this.refreshAccessToken(credentials.refreshToken)
                credentials.accessToken = idpResponse.access_token
                credentials.validUntil = idpResponse.validUntil
                if (idpResponse.refresh_token) {
                    credentials.refreshToken = idpResponse.refresh_token
                    commonLogger.info(CortexCredentialProvider, 'Received new Cortex Refresh Token')
                }
                await this.updateCredentialsItem(datalakeId, credentials)
            } catch {
                commonLogger.info(CortexCredentialProvider, 'Failed to get a new access token')
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
        throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid response received by IDP provider`)
    }

    protected async defaultCredentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        let credObject = new DefaultCredentials(datalakeId, entryPoint, accTokenGuardTime, this, prefetch)
        commonLogger.info(CortexCredentialProvider, `Instantiated new credential object from the factory for datalake id ${datalakeId}`)
        return credObject
    }

    protected async abstract createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>
    protected async abstract updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>
    protected async abstract deleteCredentialsItem(datalakeId: string): Promise<void>
    protected async abstract loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }>
    protected async abstract credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials>
}

class DefaultCredentialsProvider extends CortexCredentialProvider {
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

    protected async loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }> {
        commonLogger.info(this, 'Stateless credential provider. Returning an empty item list to load() request')
        return {}
    }

    protected credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        return this.defaultCredentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch)
    }
}

class DefaultCredentials extends Credentials {
    accessTokenSupplier: CortexCredentialProvider
    datalakeId: string

    constructor(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, supplier: CortexCredentialProvider,
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