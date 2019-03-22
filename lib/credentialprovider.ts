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
import { stat } from 'fs';

const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const IDP_AUTH_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'
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

export interface CortexClientParams<T> {
    instance_id: string,
    instance_name?: string,
    location?: {
        region: string,
        entryPoint?: EntryPoint
    }
    lsn?: string,
    customFields?: T
}

export interface CredentialProviderOptions {
    idpTokenUrl?: string
    idpRevokeUrl?: string
    idpAuthUrl?: string
    accTokenGuardTime?: number
    retrierAttempts?: number
    retrierDelay?: number
}

export abstract class CortexCredentialProvider<T> {
    private clientId: string
    private clientSecret: string
    private idpTokenUrl: string
    private idpRevokeUrl: string
    private idpAuthUrl: string
    protected credentials: {
        [dlid: string]: CredentialsItem
    }
    protected credentialsRefreshToken: { [dlid: string]: string }
    private credentialsObject: { [dlid: string]: Credentials }
    private retrierAttempts?: number
    private retrierDelay?: number
    private accTokenGuardTime: number
    static className = 'CortexCredentialProvider'

    protected constructor(ops: CredentialProviderOptions & { clientId: string, clientSecret: string }) {
        this.clientId = ops.clientId
        this.clientSecret = ops.clientSecret
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL
        this.idpAuthUrl = (ops.idpAuthUrl) ? ops.idpAuthUrl : IDP_AUTH_URL
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD
        this.retrierAttempts = ops.retrierAttempts
        this.retrierDelay = ops.retrierDelay
        if (this.accTokenGuardTime > 3300) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`)
        }
    }

    private async idpRefresh(url: string, param: string | FetchOptions): Promise<AugmentedIdpResponse> {
        let res = await retrier(CortexCredentialProvider, this.retrierAttempts, this.retrierDelay, fetch, url, param)
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
        return this.idpRefresh(this.idpTokenUrl, param)
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
        return this.idpRefresh(this.idpTokenUrl, param)
    }

    private async restoreState(): Promise<void> {
        this.credentials = await this.loadCredentialsDb()
        this.credentialsRefreshToken = {}
        this.credentialsObject = {}
        for (let datalakeId in this.credentials) {
            if (!this.credentialsRefreshToken[datalakeId]) {
                try {
                    this.credentialsRefreshToken[datalakeId] = await this.retrieveCortexRefreshToken(datalakeId)
                    this.credentialsObject[datalakeId] = await this.credentialsObjectFactory(datalakeId, this.accTokenGuardTime)
                } catch (e) {
                    commonLogger.info(CortexCredentialProvider, `Refresh Token for datalake ${datalakeId} not available at restore time. Due to ${(e as Error).message}`)
                    delete this.credentials[datalakeId]
                }
            }
        }
        commonLogger.info(CortexCredentialProvider, `Successfully restored ${Object.keys(this.credentials).length} items`)
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
        commonLogger.info(CortexCredentialProvider, `Issued new Credentials Object for datalake ID ${datalakeId}`)
        return credentialsObject
    }

    private async issueWithRefreshToken(datalakeId: string, refreshToken: string): Promise<Credentials> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (this.credentialsRefreshToken[datalakeId] == refreshToken) {
            return this.issueCredentialsObject(datalakeId)
        }
        if (!this.credentialsRefreshToken[datalakeId]) {
            this.credentialsRefreshToken[datalakeId] = refreshToken
            await this.createCortexRefreshToken(datalakeId, refreshToken)
        } else {
            this.credentialsRefreshToken[datalakeId] = refreshToken
            await this.updateCortexRefreshToken(datalakeId, refreshToken)
        }
        let idpResponse = await this.refreshAccessToken(refreshToken)
        if (idpResponse.refresh_token) {
            this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token
            commonLogger.info(CortexCredentialProvider, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`)
            await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token)
        }
        commonLogger.info(CortexCredentialProvider, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`)
        return this.settleCredObject(datalakeId, idpResponse.access_token, idpResponse.validUntil)
    }

    async registerCodeDatalake(code: string, state: string, redirectUri: string, ): Promise<Credentials> {
        let idpResponse = await this.fetchTokens(code, redirectUri)
        if (!idpResponse.refresh_token) {
            throw new PanCloudError(CortexCredentialProvider, 'IDENTITY', 'Identity response does not include a refresh token')
        }
        let authState = await this.restoreAuthState(state)
        let credential = await this.issueWithRefreshToken(authState.datalakeId, idpResponse.refresh_token)
        await this.deleteAuthState(state)
        return credential
    }

    async registerManualDatalake(datalakeId: string, refreshToken: string): Promise<Credentials> {
        return this.issueWithRefreshToken(datalakeId, refreshToken)
    }

    async issueCredentialsObject(datalakeId: string): Promise<Credentials> {
        if (!this.credentials) {
            await this.restoreState()
        }
        if (this.credentials[datalakeId]) {
            commonLogger.info(CortexCredentialProvider, `Providing cached credentials object for datalake ID ${datalakeId}`)
            return this.credentialsObject[datalakeId]
        }
        let refreshToken = await this.retrieveCortexRefreshToken(datalakeId)
        commonLogger.info(CortexCredentialProvider, `Retrieved Cortex Refresh Token for datalake ID ${datalakeId} from Store`)
        return this.issueWithRefreshToken(datalakeId, refreshToken)
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
                "token": this.credentialsRefreshToken[datalakeId],
                "token_type_hint": "refresh_token"
            })
        }
        try {
            await this.idpRevoke(this.idpRevokeUrl, param)
            commonLogger.info(CortexCredentialProvider, `Successfully revoked refresh token for datalake ${datalakeId}`)
        } catch (e) {
            commonLogger.alert(CortexCredentialProvider, `Non expected revoke response received by IDP ${e}`)
        }
        delete this.credentialsRefreshToken[datalakeId]
        await this.deleteCortexRefreshToken(datalakeId)
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
                let idpResponse = await this.refreshAccessToken(this.credentialsRefreshToken[datalakeId])
                credentials.accessToken = idpResponse.access_token
                credentials.validUntil = idpResponse.validUntil
                if (idpResponse.refresh_token) {
                    this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token
                    commonLogger.info(CortexCredentialProvider, 'Received new Cortex Refresh Token')
                    await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token)
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

    async idpAuthRequest(redirectUri: string, scope: OAUTH2SCOPE[], datalakeId: string, clientParams: CortexClientParams<T>): Promise<URL> {
        let qsParams: { [index: string]: string } = {
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: redirectUri,
            scope: scope.join(' '),
            instance_id: clientParams.instance_id,
            state: await this.requestAuthState(datalakeId, clientParams)
        }
        let urlString = `${this.idpAuthUrl}?${qsStringify(qsParams)}`
        commonLogger.info(CortexCredentialProvider, `Providing IDP Auth URL: ${urlString}`)
        return new URL(urlString)
    }

    paramsParser(queryString: string): CortexClientParams<T> {
        let b64Decoded = ''
        try {
            b64Decoded = Buffer.from(queryString, 'base64').toString()
        } catch (e) {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `${queryString} is not a valid base64 string`)
        }
        let parsed = qsParse(b64Decoded)
        if (!(parsed.instance_id && typeof parsed.instance_id == 'string')) {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Missing mandatory instance_id in ${queryString}`)
        }
        let cParams: CortexClientParams<T> = {
            instance_id: parsed.instance_id
        }
        delete parsed.instance_id
        if (parsed.instance_name && typeof parsed.instance_name == 'string') {
            cParams.instance_name = parsed.instance_name
            delete parsed.instance_name
        }
        if (parsed.lsn && typeof parsed.lsn == 'string') {
            cParams.lsn = parsed.lsn
            delete parsed.lsn
        }
        if (parsed.region && typeof parsed.region == 'string') {
            cParams.location = { region: parsed.region, entryPoint: region2EntryPoint[parsed.region] }
            delete parsed.region
        }
        try {
            let customField = (JSON.parse(JSON.stringify(parsed)) as T)
            cParams.customFields = customField
        } catch (e) {
            commonLogger.error(PanCloudError.fromError(CortexCredentialProvider, e))
        }
        return cParams
    }

    protected async defaultCredentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        let credObject = new DefaultCredentials(datalakeId, accTokenGuardTime, this, prefetch)
        commonLogger.info(CortexCredentialProvider, `Instantiated new credential object from the factory for datalake id ${datalakeId}`)
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
    protected async abstract requestAuthState(datalakeId: string, clientParams: CortexClientParams<T>): Promise<string>
    protected async abstract restoreAuthState(state: string): Promise<{ datalakeId: string, clientParams: CortexClientParams<T> }>
    protected async abstract deleteAuthState(state: string): Promise<void>
    protected async abstract credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials>
}

class DefaultCredentialsProvider<T> extends CortexCredentialProvider<T> {
    private envPrefix: string
    private sequence: number
    private authRequest: {
        [state: string]: {
            datalakeId: string,
            clientParams: CortexClientParams<T>
        }
    }
    className = 'DefaultCredentialsProvider'

    constructor(ops: CredentialProviderOptions & { clientId: string, clientSecret: string, envPrefix: string }) {
        super(ops)
        this.envPrefix = ops.envPrefix
        this.sequence = Math.floor(Date.now() * Math.random())
        this.authRequest = {}
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

    protected requestAuthState(datalakeId: string, clientParams: CortexClientParams<T>): Promise<string> {
        let state = (this.sequence++).toString()
        this.authRequest[state] = {
            datalakeId: datalakeId,
            clientParams: clientParams
        }
        commonLogger.info(this, `Stateless credential provider. Keeping the state in memory with key ${state}`)
        return Promise.resolve(state)
    }

    protected restoreAuthState(state: string): Promise<{ datalakeId: string; clientParams: CortexClientParams<T> }> {
        if (!this.authRequest[state]) {
            throw new PanCloudError(this, 'CONFIG', `Unknown authentication state ${state}`)
        }
        commonLogger.info(this, `Stateless credential provider. Returning the state from memory for key ${state}`)
        return Promise.resolve(this.authRequest[state])
    }

    protected deleteAuthState(state: string): Promise<void> {
        delete this.authRequest[state]
        commonLogger.info(this, `Stateless credential provider. Removed the state from memory with key ${state}`)
        return Promise.resolve()
    }

    protected credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch)
    }
}

class DefaultCredentials extends Credentials {
    accessTokenSupplier: CortexCredentialProvider<{}>
    datalakeId: string

    constructor(datalakeId: string, accTokenGuardTime: number, supplier: CortexCredentialProvider<{}>,
        prefetch?: { accessToken: string, validUntil: number }) {
        super(accTokenGuardTime)
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
    refreshToken?: string
}): Promise<Credentials> {
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX
    let envClientId = `${ePrefix}_MASTER_CLIENTID`
    let envClientSecret = `${ePrefix}_MASTER_CLIENTSECRET`
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
    if (ops && ops.refreshToken) {
        env[`${ePrefix}_REFRESH_DEFAULT`] = ops.refreshToken
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret'`)
    return new DefaultCredentialsProvider({
        envPrefix: ePrefix,
        clientId: cId,
        clientSecret: cSec,
        ...ops
    }).issueCredentialsObject('DEFAULT')
}