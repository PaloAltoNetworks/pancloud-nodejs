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

import { commonLogger, EntryPoint, region2EntryPoint, OAUTH2SCOPE } from './common'
import { CortexCredentialProvider, AugmentedIdpResponse } from './credentialprovider'
import { Credentials } from './credentials'
import { FetchOptions } from './fetch'
import { PanCloudError } from './error'
import { stringify as qsStringify, parse as qsParse } from 'querystring'
import { URL } from 'url'

const IDP_AUTH_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'

/**
 * Interface that describes the object pushed by the `authCallbackHandler` method into the
 * *express.Request* property `callbackIdp` after a Cortex Hub callback handling
 */
export interface HubIdpCallback {
    /**
     * Would describe the error during the callback processing (if any)
     */
    error?: string
    /**
     * Optional message in the response
     */
    message?: string
    /**
     * Datalake ID if successfully processed and stored
     */
    datalakeId?: string
}

interface HubPassportRequest<U> {
    query: { code: string, state: string },
    user?: U,
    callbackIdp?: HubIdpCallback
    [key: string]: any
}

/**
 * Describes the `params` object provided by Cortex HUB. The `T` type must extend a string
 * dictionary and is expected to contain the *custom fields* provided by the application in the
 * manifest file
 */
export interface CortexClientParams<T extends { [key: string]: string }> {
    /**
     * Unique ID assigned by Cortex HUB to this application<->datalake combination
     */
    instance_id: string,
    /**
     * Convenient placeholder to allow applications using this SDK attach a friendly name to
     * the Instance ID
     */
    instance_name?: string,
    /**
     * Augmented `region` property provided by Cortex HUB. Use the `paramsaParser` method to generate
     * this augmentation out of the BASE64 string provided by Cortex HUB
     */
    location: {
        /**
         * Region value as provided by Cortex HUB
         */
        region: string,
        /**
         * Augmented API entry point for the provided region
         */
        entryPoint: EntryPoint
    }
    /**
     * Serial number of the Cortex Datalake at the other end of this Instance ID
     */
    lsn?: string,
    /**
     * Optional fields requested in the application manifest file
     */
    customFields?: T
}

/**
 * Convenience function to check if a given object conforms to the `CortexClientParams` interface
 * @param obj the object to be checked
 */
export function isCortexClientParams<T extends { [key: string]: string }>(obj: any): obj is CortexClientParams<T> {
    return obj && obj.instance_id && typeof obj.instance_id == 'string' &&
        obj.instance_name && typeof obj.instance_name == 'string' &&
        (obj.lsn == undefined || typeof obj.lsn == 'string') &&
        obj.location && typeof obj.location == 'object' &&
        obj.location.region && typeof obj.location.region == 'string' &&
        obj.location.entryPoint && typeof obj.location.entryPoint == 'string'
}

/**
 * Anyone willing to extend the `CortexHubHelper` abstract class will need to implement storage
 * methods dealing with objects conforming to this interface. It describes an *authorization state*
 * (a pending authorization sent to IDP for user consent)
 */
export interface HubIdpStateData<M> {
    /**
     * Requester Tenant ID
     */
    tenantId: string,
    /**
     * Requested datalakeID 
     */
    datalakeId: string,
    metadata: M
}

/**
 * Optional configuration attributes for the `CortexHubHelper` class
 */
export interface CortexHelperOptions {
    /**
     * URL of the IDP authorization entry point (defaults to `https://identity.paloaltonetworks.com/as/authorization.oauth2`)
     */
    idpAuthUrl?: string
    /**
     * Controls wheter the autorization callback should check the requester Tenant ID (defaults to
     * `false`)
     */
    forceCallbackTenantValidation?: boolean
}

/**
 * Abstract class with methods to help interfacing with the Cortex HUB.
 * @param T dictionary-like extension with custom fields provided by the application in the
 * manifest file
 * @param U interface used by the `req.user` object provided by a *PassportJS-like* enabled
 * application willing to use this class `authCallbackHandler` method.
 * @param K the string-like property in `U` containing the requester TenantID
 * @param M interface describing the metadata that will be attached to datalakes in CortexCredentialProvider
 * for multi-tenancy applications. CortexHubHelper will add/replace a property named `tenantId` in M so take this into
 * consideration when defining the interface `M`
 */
export abstract class CortexHubHelper<T extends { [key: string]: string }, U, K extends keyof U, M> {
    private clientId: string
    private clientSecret: string
    private idpAuthUrl: string
    private callbackTenantValidation: boolean
    private credProvider: CortexCredentialProvider<{ tenantId: string } & M, 'tenantId'>
    private idpCallbackUrl: string
    private tenantKey?: K
    static className = 'CortexHubHelper'

    /**
     * Constructor method
     * @param idpCallbackUrl One of the URI's provided in the `auth_redirect_uris` field of the manifest file
     * @param credProv a `CortexCredentialProvider` instance that will be used by the `authCallbackHandler` to
     * register new datalakes after activation
     * @param tenantKey the name of the string-like property in `U` that contains the requesting Tenant ID
     * @param ops class configuration options
     */
    constructor(idpCallbackUrl: string, credProv: CortexCredentialProvider<{ tenantId: string } & M, 'tenantId'>, tenantKey?: K, ops?: CortexHelperOptions) {
        this.idpAuthUrl = (ops && ops.idpAuthUrl) ? ops.idpAuthUrl : IDP_AUTH_URL
        this.callbackTenantValidation = (ops && typeof ops.forceCallbackTenantValidation == 'boolean') ? ops.forceCallbackTenantValidation : false
        this.idpCallbackUrl = idpCallbackUrl
        this.tenantKey = tenantKey;
        [this.clientId, this.clientSecret] = credProv.getSecrets()
        this.credProvider = credProv
    }

    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    private fetchTokens(code: string): Promise<AugmentedIdpResponse> {
        let param: FetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                "client_id": this.clientId,
                "client_secret": this.clientSecret,
                "redirect_uri": this.idpCallbackUrl,
                "grant_type": "authorization_code",
                "code": code
            })
        }
        return this.credProvider.idpRefresh(param)
    }

    /**
     * Prepares an IDP authorization request
     * @param tenantId Requesting Tenant ID (will be store in the authorization state)
     * @param datalakeId Datalake ID willing to activate (will be store in the authorization state)
     * @param scope OAUTH2 Data access Scope(s)
     * @returns a URI ready to be consumed (typically to be used for a client 302 redirect)
     */
    async idpAuthRequest(tenantId: string, datalakeId: string, scope: OAUTH2SCOPE[], metadata: M): Promise<URL> {
        let clientParams = await this.getDatalake(tenantId, datalakeId)
        if (!this.idpCallbackUrl) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', `idpCallbackUrl was not provided in the ops passed to the constructor. Can't request auth without it.`)
        }
        let stateId = await this.requestAuthState({ tenantId: tenantId, datalakeId: datalakeId, metadata: metadata })
        let qsParams: { [index: string]: string } = {
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.idpCallbackUrl,
            scope: scope.join(' '),
            instance_id: clientParams.instance_id,
            state: stateId
        }
        let urlString = `${this.idpAuthUrl}?${qsStringify(qsParams)}`
        commonLogger.info(CortexHubHelper, `Providing IDP Auth URL: ${urlString}`)
        return new URL(urlString)
    }

    /**
     * ExpressJS handler (middleware) that deals with IDP Authentication Callback. The method
     * relies on some properties and methods of `this` so be remember to `bind()` the method
     * to the object when using it elsewhere
     * @param req `express.Request` object. If `callbackTenantValidation` was set to
     * true at class instantiation time, then the method expects a string-like field `K`
     * in the `req.user` object containing the requesting Tenant ID. A field named `callbackIdp`
     * containing a `HubIdpCallback` object with the processing result will be populated here.
     * @param next next handler in the chain that will be called under any condition
     */
    async authCallbackHandler(
        req: HubPassportRequest<U>,
        resp: any, next: () => void): Promise<void> {
        let code = req.query.code
        let state = req.query.state
        let callbackStatus: HubIdpCallback
        if (!(code && typeof code == 'string' && state && typeof state == 'string')) {
            commonLogger.error(new PanCloudError(CortexHubHelper, 'PARSER', `Either code or state are missing or not strings: state: ${state}`))
            callbackStatus = { error: 'code or state missing' }
            req.callbackIdp = callbackStatus
            next()
            return
        }
        let tenantId: string
        let datalakeId: string
        let metadata: M
        try {
            ({ tenantId, datalakeId, metadata } = await this.restoreAuthState(state))
        } catch (e) {
            commonLogger.alert(CortexHubHelper, `Unable to restore state ${state} in callback helper`)
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            callbackStatus = { error: `unable to restore state ${state}` }
            req.callbackIdp = callbackStatus
            next()
            return
        }
        try {
            await this.deleteAuthState(state)
        } catch (e) {
            commonLogger.alert(CortexHubHelper, `Failed to delete state ${state} in callback helper`)
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
        }
        if (this.callbackTenantValidation) {
            let tKey = this.tenantKey
            if (tKey === undefined) {
                commonLogger.alert(CortexHubHelper, `Cannot validate tenant because tenant key was not provided at instantiation time`)
                callbackStatus = { error: 'tenant key is unknown' }
                req.callbackIdp = callbackStatus
                next()
                return
            }
            if (!(req.user && req.user[tKey])) {
                commonLogger.alert(CortexHubHelper, `Tenant validation failed: tenant key ${this.tenantKey} does not exist in request ${JSON.stringify(req.user)}`)
                callbackStatus = { error: 'tenant key not present in request' }
                req.callbackIdp = callbackStatus
                next()
                return
            }
            let reqTenantId = req.user[tKey]
            if (!(typeof reqTenantId == 'string' && reqTenantId != tenantId)) {
                commonLogger.alert(CortexHubHelper, `Tenant validation failed: state tenantId ${tenantId} not equal to request tenantId ${JSON.stringify(reqTenantId)}`)
                callbackStatus = { error: 'tenantId in request does not match the one in the stored state' }
                req.callbackIdp = callbackStatus
                next()
                return
            }
        }
        let idpResponse: AugmentedIdpResponse
        try {
            idpResponse = await this.fetchTokens(code)
        } catch (e) {
            commonLogger.alert(CortexHubHelper, 'Unable to fetch credentials from IDP in callback helper')
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            callbackStatus = { error: 'failed to exchange code for tokens' }
            req.callbackIdp = callbackStatus
            next()
            return
        }
        if (!idpResponse.refresh_token) {
            commonLogger.alert(CortexHubHelper, 'Identity response does not include a refresh token')
            callbackStatus = { error: 'response does not include a refresh token' }
            req.callbackIdp = callbackStatus
            next()
            return
        }
        let clientParams: CortexClientParams<T>
        try {
            clientParams = await this.getDatalake(tenantId, datalakeId)
        } catch (e) {
            commonLogger.alert(CortexHubHelper, `Unable to get client params for ${tenantId}/${datalakeId}`)
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            callbackStatus = { error: 'failed to augmentate the state' }
            req.callbackIdp = callbackStatus
            next()
            return
        }
        try {
            await this.credProvider.issueWithRefreshToken(datalakeId,
                clientParams.location.entryPoint, idpResponse.refresh_token,
                { accessToken: idpResponse.access_token, validUntil: idpResponse.validUntil },
                { tenantId: tenantId, ...metadata })
            callbackStatus = { message: 'OK', datalakeId: datalakeId }
            req.callbackIdp = callbackStatus
            next()
        } catch (e) {
            commonLogger.error(e as PanCloudError)
            callbackStatus = { error: 'error storing the oauth2 tokens' }
            req.callbackIdp = callbackStatus
            next()
        }
    }

    /**
     * Parses the CortexHub BASE64 params string into a CortexClientParams object
     * @param queryString Input string
     */
    paramsParser(queryString: string): CortexClientParams<T> {
        let b64Decoded = ''
        try {
            b64Decoded = Buffer.from(queryString, 'base64').toString()
        } catch (e) {
            throw new PanCloudError(CortexHubHelper, 'PARSER', `${queryString} is not a valid base64 string`)
        }
        let parsed = qsParse(b64Decoded)
        if (!(parsed.instance_id && typeof parsed.instance_id == 'string')) {
            throw new PanCloudError(CortexHubHelper, 'PARSER', `Missing mandatory instance_id in ${queryString}`)
        }
        if (!(parsed.region && typeof parsed.region == 'string')) {
            throw new PanCloudError(CortexHubHelper, 'PARSER', `Missing or invalid region in ${queryString}`)
        }
        let cParams: CortexClientParams<T> = {
            instance_id: parsed.instance_id,
            location: { region: parsed.region, entryPoint: region2EntryPoint[parsed.region] }
        }
        delete parsed.instance_id
        delete parsed.region
        if (parsed.instance_name && typeof parsed.instance_name == 'string') {
            cParams.instance_name = parsed.instance_name
            delete parsed.instance_name
        }
        if (parsed.lsn && typeof parsed.lsn == 'string') {
            cParams.lsn = parsed.lsn
            delete parsed.lsn
        }
        try {
            let customField = (JSON.parse(JSON.stringify(parsed)) as T)
            cParams.customFields = customField
        } catch (e) {
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
        }
        return cParams
    }

    /**
     * Retrieves the list of datalakes registered under this tenant
     * @param tenantId requesting Tenant ID
     */
    async listDatalake(tenantId: string): Promise<({ id: string } & CortexClientParams<T>)[]> {
        let response = await this._listDatalake(tenantId)
        commonLogger.info(CortexHubHelper, `Successfully retrieved list of datalakes for tenant ${tenantId} from store`)
        return response
    }

    /**
     * Gets metadata of a given Datalake ID as a `CortexClientParams` object
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the Datalake
     */
    async getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>> {
        let response = await this._getDatalake(tenantId, datalakeId)
        commonLogger.info(CortexHubHelper, `Successfully retrieved datalake ${tenantId}/${datalakeId} from store`)
        return response
    }

    /**
     * Stores datalake metadata
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     * @param clientParams metadata as a `CortexClientParams` object
     */
    async upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void> {
        let response = await this._upsertDatalake(tenantId, datalakeId, clientParams)
        commonLogger.info(CortexHubHelper, `Successfully upserted datalake ${tenantId}/${datalakeId} into store`)
        return response
    }

    /**
     * Deletes a datalake metadata record
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     */
    async deleteDatalake(tenantId: string, datalakeId: string): Promise<void> {
        await this.credProvider.deleteDatalake(datalakeId)
        commonLogger.info(CortexHubHelper, `Successfully deleted datalake ${datalakeId} from credentials provider`)
        await this._deleteDatalake(tenantId, datalakeId)
        commonLogger.info(CortexHubHelper, `Successfully deleted datalake ${tenantId}/${datalakeId} from hub helper`)
    }

    /**
     * Abstraction that allows the `CortexHubHelper` subclass implementation reach out its bound `CortexCredentialProvider`
     * The typical use case if for the `CortexHubHelper` to ask the `CortexCredentialProvider` the list of datalake ID's
     * it holds (activated) for a given tenant ID
     * @param tenantId 
     */
    async datalakeActiveList(tenantId: string): Promise<string[]> {
        let activeList = await this.credProvider.selectDatalakeByTenant(tenantId as any)
        commonLogger.info(CortexHubHelper, `Retrieved ${activeList} items from CredentialProvide for tenantid ${tenantId}`)
        return activeList
    }

    async getCredentialsObject(tenantId: string, datalakeId: string): Promise<Credentials> {
        let activeList = await this.credProvider.selectDatalakeByTenant(tenantId as any)
        if (!activeList.includes(datalakeId)) {
            commonLogger.alert(CortexHubHelper, `Attempt request to access the datalake ${datalakeId} not present in ${tenantId} credentials store`)
            throw new PanCloudError(CortexHubHelper, 'CONFIG', `datalake ${datalakeId} not found`)
        }
        return this.credProvider.getCredentialsObject(datalakeId)
    }

    protected abstract _listDatalake(tenantId: string): Promise<({ id: string } & CortexClientParams<T>)[]>
    protected abstract _getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>>
    protected abstract _upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void>
    protected abstract _deleteDatalake(tenantId: string, datalakeId: string): Promise<void>
    protected abstract requestAuthState(stateData: HubIdpStateData<M>): Promise<string>
    protected abstract restoreAuthState(stateId: string): Promise<HubIdpStateData<M>>
    protected abstract deleteAuthState(stateId: string): Promise<void>
}
