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
class CortexHubHelper {
    constructor(idpCallbackUrl, credProv, ops) {
        this.idpAuthUrl = (ops && ops.idpAuthUrl) ? ops.idpAuthUrl : IDP_AUTH_URL;
        this.idpCallbackUrl = idpCallbackUrl;
        [this.clientId, this.clientSecret] = credProv.getSecrets();
        this.credProvider = credProv;
    }
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    fetchTokens(code, redirectUri) {
        let param = {
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
        };
        return this.credProvider.idpRefresh(param);
    }
    async idpAuthRequest(tenantId, datalakeId, scope) {
        let clientParams = await this.getDatalake(tenantId, datalakeId);
        if (!this.idpCallbackUrl) {
            throw new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'CONFIG', `idpCallbackUrl was not provided in the ops passed to the constructor. Can't request auth without it.`);
        }
        let stateId = await this.requestAuthState(tenantId, datalakeId);
        let qsParams = {
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.idpCallbackUrl,
            scope: scope.join(' '),
            instance_id: clientParams.instance_id,
            state: stateId
        };
        let urlString = `${this.idpAuthUrl}?${querystring_1.stringify(qsParams)}`;
        common_1.commonLogger.info(credentialprovider_1.CortexCredentialProvider, `Providing IDP Auth URL: ${urlString}`);
        return new url_1.URL(urlString);
    }
    async authCallbackHandler(req, resp, redirectUri, validateTenant = (req, tenantId) => true) {
        let code = req.query.code;
        let state = req.query.state;
        if (!(code && typeof code == 'string' && state && typeof state == 'string')) {
            common_1.commonLogger.error(new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'PARSER', `Either code or state are missing or not strings: state: ${state}`));
            redirectUri.search = 'idperror=code or state missing';
            resp.redirect(redirectUri.toString());
            return;
        }
        let tenantId;
        let datalakeId;
        try {
            ({ tenantId, datalakeId } = await this.restoreAuthState(state));
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, `Unable to restore state ${state} in callback helper`);
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            redirectUri.search = `idperror=unable to restore state ${state}`;
            resp.redirect(redirectUri.toString());
            return;
        }
        if (!validateTenant(req, tenantId)) {
            common_1.commonLogger.alert(CortexHubHelper, `Tenant validation failed for tenantId: ${tenantId} in request ${JSON.stringify(req)}`);
            redirectUri.search = `idperror=code activation does not belong to this tenantId`;
            resp.redirect(redirectUri.toString());
            return;
        }
        let idpResponse;
        try {
            idpResponse = await this.fetchTokens(code, redirectUri.toString());
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, 'Unable to fetch credentials from IDP in callback helper');
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            redirectUri.search = `idperror=failed to exchange code for tokens`;
            resp.redirect(redirectUri.toString());
            return;
        }
        if (!idpResponse.refresh_token) {
            common_1.commonLogger.alert(CortexHubHelper, 'Identity response does not include a refresh token');
            redirectUri.search = `idperror=response does not include a refresh token`;
            resp.redirect(redirectUri.toString());
            return;
        }
        let clientParams;
        try {
            clientParams = await this.getDatalake(tenantId, datalakeId);
        }
        catch (e) {
            common_1.commonLogger.alert(CortexHubHelper, `Unable to get client params for ${tenantId}/${datalakeId}`);
            common_1.commonLogger.error(error_1.PanCloudError.fromError(CortexHubHelper, e));
            redirectUri.search = `idperror=failed to augmentate the state`;
            resp.redirect(redirectUri.toString());
            return;
        }
        try {
            await this.credProvider.issueWithRefreshToken(datalakeId, clientParams.location.entryPoint, idpResponse.refresh_token);
            await this.deleteAuthState(state);
            redirectUri.search = `idpok=${datalakeId}`;
            resp.redirect(redirectUri.toString());
        }
        catch (e) {
            common_1.commonLogger.error(e);
            redirectUri.search = 'idperror=error storing the oauth2 tokens';
            resp.redirect(redirectUri.toString());
        }
    }
    paramsParser(queryString) {
        let b64Decoded = '';
        try {
            b64Decoded = Buffer.from(queryString, 'base64').toString();
        }
        catch (e) {
            throw new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'PARSER', `${queryString} is not a valid base64 string`);
        }
        let parsed = querystring_1.parse(b64Decoded);
        if (!(parsed.instance_id && typeof parsed.instance_id == 'string')) {
            throw new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'PARSER', `Missing mandatory instance_id in ${queryString}`);
        }
        if (!(parsed.region && typeof parsed.region == 'string')) {
            throw new error_1.PanCloudError(credentialprovider_1.CortexCredentialProvider, 'PARSER', `Missing or invalid region in ${queryString}`);
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
            common_1.commonLogger.error(error_1.PanCloudError.fromError(credentialprovider_1.CortexCredentialProvider, e));
        }
        return cParams;
    }
}
CortexHubHelper.className = 'CortexHubHelper';
exports.CortexHubHelper = CortexHubHelper;
