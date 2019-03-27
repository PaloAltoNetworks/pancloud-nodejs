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
import { FetchOptions } from './fetch'
import { PanCloudError } from './error'
import { stringify as qsStringify, parse as qsParse } from 'querystring'
import { URL } from 'url'
import * as express from 'express'
import { timingSafeEqual } from 'crypto';

const IDP_AUTH_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'

export interface CortexClientParams<T> {
    instance_id: string,
    instance_name?: string,
    location: {
        region: string,
        entryPoint: EntryPoint
    }
    lsn?: string,
    customFields?: T
}

type stateData = { tenantId: string, datalakeId: string }

export interface CortexHelperOptions {
    idpAuthUrl?: string
}

export abstract class CortexHubHelper<T> {
    private clientId: string
    private clientSecret: string
    private idpAuthUrl: string
    private credProvider: CortexCredentialProvider
    protected idpCallbackUrl: string
    static className = 'CortexHubHelper'

    constructor(idpCallbackUrl: string, credProv: CortexCredentialProvider, ops?: CortexHelperOptions) {
        this.idpAuthUrl = (ops && ops.idpAuthUrl) ? ops.idpAuthUrl : IDP_AUTH_URL
        this.idpCallbackUrl = idpCallbackUrl;
        [this.clientId, this.clientSecret] = credProv.getSecrets()
        this.credProvider = credProv
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
        return this.credProvider.idpRefresh(param)
    }

    async idpAuthRequest(tenantId: string, datalakeId: string, scope: OAUTH2SCOPE[]): Promise<URL> {
        let clientParams = await this.getDatalake(tenantId, datalakeId)
        if (!this.idpCallbackUrl) {
            throw new PanCloudError(CortexCredentialProvider, 'CONFIG', `idpCallbackUrl was not provided in the ops passed to the constructor. Can't request auth without it.`)
        }
        let stateId = await this.requestAuthState(tenantId, datalakeId)
        let qsParams: { [index: string]: string } = {
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.idpCallbackUrl,
            scope: scope.join(' '),
            instance_id: clientParams.instance_id,
            state: stateId
        }
        let urlString = `${this.idpAuthUrl}?${qsStringify(qsParams)}`
        commonLogger.info(CortexCredentialProvider, `Providing IDP Auth URL: ${urlString}`)
        return new URL(urlString)
    }

    async authCallbackHandler(req: express.Request, resp: express.Response,
        redirectUri: URL, validateTenant = (req: express.Request, tenantId: string) => true): Promise<void> {
        let code = req.query.code
        let state = req.query.state
        if (!(code && typeof code == 'string' && state && typeof state == 'string')) {
            commonLogger.error(new PanCloudError(CortexCredentialProvider, 'PARSER', `Either code or state are missing or not strings: state: ${state}`))
            redirectUri.search = 'idperror=code or state missing'
            resp.redirect(redirectUri.toString())
            return
        }
        let tenantId: string
        let datalakeId: string
        try {
            ({ tenantId, datalakeId } = await this.restoreAuthState(state))
        } catch (e) {
            commonLogger.alert(CortexHubHelper, `Unable to restore state ${state} in callback helper`)
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            redirectUri.search = `idperror=unable to restore state ${state}`
            resp.redirect(redirectUri.toString())
            return
        }
        if (!validateTenant(req, tenantId)) {
            commonLogger.alert(CortexHubHelper, `Tenant validation failed for tenantId: ${tenantId} in request ${JSON.stringify(req)}`)
            redirectUri.search = `idperror=code activation does not belong to this tenantId`
            resp.redirect(redirectUri.toString())
            return
        }
        let idpResponse: AugmentedIdpResponse
        try {
            idpResponse = await this.fetchTokens(code, redirectUri.toString())
        } catch (e) {
            commonLogger.alert(CortexHubHelper, 'Unable to fetch credentials from IDP in callback helper')
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            redirectUri.search = `idperror=failed to exchange code for tokens`
            resp.redirect(redirectUri.toString())
            return
        }
        if (!idpResponse.refresh_token) {
            commonLogger.alert(CortexHubHelper, 'Identity response does not include a refresh token')
            redirectUri.search = `idperror=response does not include a refresh token`
            resp.redirect(redirectUri.toString())
            return
        }
        let clientParams: CortexClientParams<T>
        try {
            clientParams = await this.getDatalake(tenantId, datalakeId)
        } catch (e) {
            commonLogger.alert(CortexHubHelper, `Unable to get client params for ${tenantId}/${datalakeId}`)
            commonLogger.error(PanCloudError.fromError(CortexHubHelper, e))
            redirectUri.search = `idperror=failed to augmentate the state`
            resp.redirect(redirectUri.toString())
            return
        }
        try {
            await this.credProvider.issueWithRefreshToken(datalakeId,
                clientParams.location.entryPoint, idpResponse.refresh_token)
            await this.deleteAuthState(state)
            redirectUri.search = `idpok=${datalakeId}`
            resp.redirect(redirectUri.toString())
        } catch (e) {
            commonLogger.error(e as PanCloudError)
            redirectUri.search = 'idperror=error storing the oauth2 tokens'
            resp.redirect(redirectUri.toString())
        }
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
        if (!(parsed.region && typeof parsed.region == 'string')) {
            throw new PanCloudError(CortexCredentialProvider, 'PARSER', `Missing or invalid region in ${queryString}`)
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
            commonLogger.error(PanCloudError.fromError(CortexCredentialProvider, e))
        }
        return cParams
    }

    protected abstract listDatalake(tenantId: string): Promise<{ datalakeId: string, clientParams: CortexClientParams<T> }[]>
    protected abstract upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void>
    protected abstract getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>>
    protected abstract deleteDatalake(tenantId: string, datalakeId: string): Promise<void>
    protected abstract requestAuthState(tenantId: string, datalakeId: string): Promise<string>
    protected abstract restoreAuthState(state: string): Promise<{ tenantId: string, datalakeId: string }>
    protected abstract deleteAuthState(state: string): Promise<void>
}
