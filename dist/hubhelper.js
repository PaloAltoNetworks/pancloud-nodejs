"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const credentialprovider_1 = require("./credentialprovider");
const error_1 = require("./error");
const querystring_1 = require("querystring");
const url_1 = require("url");
const IDP_AUTH_URL = 'https://identity.paloaltonetworks.com/as/authorization.oauth2';
/**
 * Convenience function to check if a given object conforms to the `CortexClientParams` interface
 * @param obj the object to be checked
 */
function isCortexClientParams(obj) {
    return obj && obj.instance_id && typeof obj.instance_id == 'string' &&
        obj.instance_name && typeof obj.instance_name == 'string' &&
        (obj.lsn == undefined || typeof obj.lsn == 'string') &&
        obj.location && typeof obj.location == 'object' &&
        obj.location.region && typeof obj.location.region == 'string' &&
        obj.location.entryPoint && typeof obj.location.entryPoint == 'string';
}
exports.isCortexClientParams = isCortexClientParams;
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
class CortexHubHelper {
    /**
     * Constructor method
     * @param idpCallbackUrl One of the URI's provided in the `auth_redirect_uris` field of the manifest file
     * @param credProv a `CortexCredentialProvider` instance that will be used by the `authCallbackHandler` to
     * register new datalakes after activation
     * @param tenantKey the name of the string-like property in `U` that contains the requesting Tenant ID
     * @param ops class configuration options
     */
    constructor(idpCallbackUrl, credProv, tenantKey, ops) {
        this.idpAuthUrl = (ops && ops.idpAuthUrl) ? ops.idpAuthUrl : IDP_AUTH_URL;
        this.callbackTenantValidation = (ops && typeof ops.forceCallbackTenantValidation == 'boolean') ? ops.forceCallbackTenantValidation : false;
        this.idpCallbackUrl = idpCallbackUrl;
        this.tenantKey = tenantKey;
        [this.clientId, this.clientSecret] = credProv.getSecrets();
        this.credProvider = credProv;
    }
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    fetchTokens(code) {
        let param = {
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
        };
        return this.credProvider.idpRefresh(param);
    }
    /**
     * Prepares an IDP authorization request
     * @param tenantId Requesting Tenant ID (will be store in the authorization state)
     * @param datalakeId Datalake ID willing to activate (will be store in the authorization state)
     * @param scope OAUTH2 Data access Scope(s)
     * @returns a URI ready to be consumed (typically to be used for a client 302 redirect)
     */
    async idpAuthRequest(tenantId, datalakeId, scope, metadata) {
        let clientParams = await this.getDatalake(tenantId, datalakeId);
        if (!this.idpCallbackUrl) {
            throw new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'CONFIG', `idpCallbackUrl was not provided in the ops passed to the constructor. Can't request auth without it.`);
        }
        let stateId = await this.requestAuthState({ tenantId: tenantId, datalakeId: datalakeId, metadata: metadata });
        let qsParams = {
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.idpCallbackUrl,
            scope: scope.join(' '),
            instance_id: clientParams.instance_id,
            state: stateId
        };
        let urlString = `${this.idpAuthUrl}?${querystring_1.stringify(qsParams)}`;
        common_1.commonLogger.info(CortexHubHelper, `Providing IDP Auth URL: ${urlString}`);
        return new url_1.URL(urlString);
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
    async authCallbackHandler(req, resp, next) {
        let code = req.query.code;
        let state = req.query.state;
        let callbackStatus;
        if (!(code && typeof code == 'string' && state && typeof state == 'string')) {
            common_1.commonLogger.error(new error_1.PanCloudError(CortexHubHelper, 'PARSER', `Either code or state are missing or not strings: state: ${state}`));
            callbackStatus = { error: 'code or state missing' };
            req.callbackIdp = callbackStatus;
            next();
            return;
        }
        let tenantId;
        let datalakeId;
        let metadata;
        try {
            ({ tenantId, datalakeId, metadata } = await this.restoreAuthState(state));
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, `Unable to restore state ${state} in callback helper`);
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            callbackStatus = { error: `unable to restore state ${state}` };
            req.callbackIdp = callbackStatus;
            next();
            return;
        }
        try {
            await this.deleteAuthState(state);
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, `Failed to delete state ${state} in callback helper`);
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
        }
        if (this.callbackTenantValidation) {
            let tKey = this.tenantKey;
            if (tKey === undefined) {
                common_1.commonLogger.alert(CortexHubHelper, `Cannot validate tenant because tenant key was not provided at instantiation time`);
                callbackStatus = { error: 'tenant key is unknown' };
                req.callbackIdp = callbackStatus;
                next();
                return;
            }
            if (!(req.user && req.user[tKey])) {
                common_1.commonLogger.alert(CortexHubHelper, `Tenant validation failed: tenant key ${this.tenantKey} does not exist in request ${JSON.stringify(req.user)}`);
                callbackStatus = { error: 'tenant key not present in request' };
                req.callbackIdp = callbackStatus;
                next();
                return;
            }
            let reqTenantId = req.user[tKey];
            if (!(typeof reqTenantId == 'string' && reqTenantId != tenantId)) {
                common_1.commonLogger.alert(CortexHubHelper, `Tenant validation failed: state tenantId ${tenantId} not equal to request tenantId ${JSON.stringify(reqTenantId)}`);
                callbackStatus = { error: 'tenantId in request does not match the one in the stored state' };
                req.callbackIdp = callbackStatus;
                next();
                return;
            }
        }
        let idpResponse;
        try {
            idpResponse = await this.fetchTokens(code);
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, 'Unable to fetch credentials from IDP in callback helper');
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            callbackStatus = { error: 'failed to exchange code for tokens' };
            req.callbackIdp = callbackStatus;
            next();
            return;
        }
        if (!idpResponse.refresh_token) {
            common_1.commonLogger.alert(CortexHubHelper, 'Identity response does not include a refresh token');
            callbackStatus = { error: 'response does not include a refresh token' };
            req.callbackIdp = callbackStatus;
            next();
            return;
        }
        let clientParams;
        try {
            clientParams = await this.getDatalake(tenantId, datalakeId);
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, `Unable to get client params for ${tenantId}/${datalakeId}`);
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            callbackStatus = { error: 'failed to augmentate the state' };
            req.callbackIdp = callbackStatus;
            next();
            return;
        }
        try {
            await this.credProvider.issueWithRefreshToken(datalakeId, clientParams.location.entryPoint, idpResponse.refresh_token, { accessToken: idpResponse.access_token, validUntil: idpResponse.validUntil }, Object.assign({ tenantId: tenantId }, metadata));
            callbackStatus = { message: 'OK', datalakeId: datalakeId };
            req.callbackIdp = callbackStatus;
            next();
        }
        catch (e) {
            common_1.commonLogger.error(e);
            callbackStatus = { error: 'error storing the oauth2 tokens' };
            req.callbackIdp = callbackStatus;
            next();
        }
    }
    /**
     * Parses the CortexHub BASE64 params string into a CortexClientParams object
     * @param queryString Input string
     */
    paramsParser(queryString) {
        let b64Decoded = '';
        try {
            b64Decoded = Buffer.from(queryString, 'base64').toString();
        }
        catch (e) {
            throw new error_1.PanCloudError(CortexHubHelper, 'PARSER', `${queryString} is not a valid base64 string`);
        }
        let parsed = querystring_1.parse(b64Decoded);
        if (!(parsed.instance_id && typeof parsed.instance_id == 'string')) {
            throw new error_1.PanCloudError(CortexHubHelper, 'PARSER', `Missing mandatory instance_id in ${queryString}`);
        }
        if (!(parsed.region && typeof parsed.region == 'string')) {
            throw new error_1.PanCloudError(CortexHubHelper, 'PARSER', `Missing or invalid region in ${queryString}`);
        }
        let cParams = {
            instance_id: parsed.instance_id,
            location: { region: parsed.region, entryPoint: common_1.region2EntryPoint[parsed.region] }
        };
        delete parsed.instance_id;
        delete parsed.region;
        if (parsed.instance_name && typeof parsed.instance_name == 'string') {
            cParams.instance_name = parsed.instance_name;
            delete parsed.instance_name;
        }
        if (parsed.lsn && typeof parsed.lsn == 'string') {
            cParams.lsn = parsed.lsn;
            delete parsed.lsn;
        }
        try {
            let customField = JSON.parse(JSON.stringify(parsed));
            cParams.customFields = customField;
        }
        catch (e) {
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
        }
        return cParams;
    }
    /**
     * Retrieves the list of datalakes registered under this tenant
     * @param tenantId requesting Tenant ID
     */
    async listDatalake(tenantId) {
        let response = await this._listDatalake(tenantId);
        common_1.commonLogger.info(CortexHubHelper, `Successfully retrieved list of datalakes for tenant ${tenantId} from store`);
        return response;
    }
    /**
     * Gets metadata of a given Datalake ID as a `CortexClientParams` object
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the Datalake
     */
    async getDatalake(tenantId, datalakeId) {
        let response = await this._getDatalake(tenantId, datalakeId);
        common_1.commonLogger.info(CortexHubHelper, `Successfully retrieved datalake ${tenantId}/${datalakeId} from store`);
        return response;
    }
    /**
     * Stores datalake metadata
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     * @param clientParams metadata as a `CortexClientParams` object
     */
    async upsertDatalake(tenantId, datalakeId, clientParams) {
        let response = await this._upsertDatalake(tenantId, datalakeId, clientParams);
        common_1.commonLogger.info(CortexHubHelper, `Successfully upserted datalake ${tenantId}/${datalakeId} into store`);
        return response;
    }
    /**
     * Deletes a datalake metadata record
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     */
    async deleteDatalake(tenantId, datalakeId) {
        await this.credProvider.deleteDatalake(datalakeId);
        common_1.commonLogger.info(CortexHubHelper, `Successfully deleted datalake ${datalakeId} from credentials provider`);
        await this._deleteDatalake(tenantId, datalakeId);
        common_1.commonLogger.info(CortexHubHelper, `Successfully deleted datalake ${tenantId}/${datalakeId} from hub helper`);
    }
    /**
     * Abstraction that allows the `CortexHubHelper` subclass implementation reach out its bound `CortexCredentialProvider`
     * The typical use case if for the `CortexHubHelper` to ask the `CortexCredentialProvider` the list of datalake ID's
     * it holds (activated) for a given tenant ID
     * @param tenantId
     */
    async datalakeActiveList(tenantId) {
        let activeList = await this.credProvider.selectDatalakeByTenant(tenantId);
        common_1.commonLogger.info(CortexHubHelper, `Retrieved ${activeList} items from CredentialProvide for tenantid ${tenantId}`);
        return activeList;
    }
    async getCredentialsObject(tenantId, datalakeId) {
        let activeList = await this.credProvider.selectDatalakeByTenant(tenantId);
        if (!activeList.includes(datalakeId)) {
            common_1.commonLogger.alert(CortexHubHelper, `Attempt request to access the datalake ${datalakeId} not present in ${tenantId} credentials store`);
            throw new error_1.PanCloudError(CortexHubHelper, 'CONFIG', `datalake ${datalakeId} not found`);
        }
        return this.credProvider.getCredentialsObject(datalakeId);
    }
}
CortexHubHelper.className = 'CortexHubHelper';
exports.CortexHubHelper = CortexHubHelper;
