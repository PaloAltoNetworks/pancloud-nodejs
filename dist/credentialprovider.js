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
const error_1 = require("./error");
const credentials_1 = require("./credentials");
const fetch_1 = require("./fetch");
const process_1 = require("process");
const IDP_TOKEN_URL = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken';
const IDP_REVOKE_URL = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken';
const ACCESS_GUARD = 300; // 5 minutes
function isCredentialItem(obj) {
    return typeof obj == 'object' &&
        obj.accessToken && typeof obj.accessToken == 'string' &&
        obj.validUntil && typeof obj.validUntil == 'number' &&
        obj.datalakeId && typeof obj.datalakeId == 'string';
}
exports.isCredentialItem = isCredentialItem;
function isIdpErrorResponse(obj) {
    return (obj.error !== undefined && typeof obj.error == 'string' &&
        obj.error_description !== undefined && typeof obj.error_description == 'string');
}
class CortexCredentialProvider {
    constructor(ops) {
        this.clientId = ops.clientId;
        this.clientSecret = ops.clientSecret;
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL;
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL;
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD;
        this.retrierAttempts = ops.retrierAttempts;
        this.retrierDelay = ops.retrierDelay;
        if (this.accTokenGuardTime > 3300) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`);
        }
    }
    getSecrets() {
        return [this.clientId, this.clientSecret];
    }
    async idpRefresh(param) {
        let res = await common_1.retrier(CortexCredentialProvider, this.retrierAttempts, this.retrierDelay, fetch_1.fetch, this.idpTokenUrl, param);
        if (!res.ok) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid JSON refresh response: ${exception.message}`);
        }
        if (isIdpErrorResponse(rJson)) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'IDENTITY', rJson.error_description);
        }
        try {
            let augmentedResponse = this.parseIdpResponse(rJson);
            common_1.commonLogger.info(CortexCredentialProvider, 'Authorization token successfully retrieved', 'IDENTITY');
            return augmentedResponse;
        }
        catch (_a) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'PARSER', `Unparseable response received from IDP refresh operation: '${JSON.stringify(rJson)}'`);
        }
    }
    async idpRevoke(url, param) {
        let res = await common_1.retrier(CortexCredentialProvider, this.retrierAttempts, this.retrierDelay, fetch_1.fetch, url, param);
        if (!res.ok) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid JSON revoke response: ${exception.message}`);
        }
        if (rJson.issuccess && typeof rJson.issuccess == 'string' && rJson.issuccess == 'true') {
            return;
        }
        throw JSON.stringify(rJson);
    }
    /**
     * Implements the Cortex Datalake OAUTH2 refresh token operation
     */
    refreshAccessToken(refreshToken) {
        let param = {
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
        };
        return this.idpRefresh(param);
    }
    async restoreState() {
        this.credentials = await this.loadCredentialsDb();
        this.credentialsObject = {};
        for (let dlake of Object.entries(this.credentials)) {
            this.credentialsObject[dlake[0]] = await this.credentialsObjectFactory(dlake[0], dlake[1].entryPoint, this.accTokenGuardTime);
        }
        common_1.commonLogger.info(CortexCredentialProvider, `Successfully restored ${Object.keys(this.credentials).length} items`);
    }
    async issueWithRefreshToken(datalakeId, entryPoint, refreshToken) {
        if (!this.credentials) {
            await this.restoreState();
        }
        let idpResponse = await this.refreshAccessToken(refreshToken);
        let currentRefreshToken = refreshToken;
        if (idpResponse.refresh_token) {
            currentRefreshToken = idpResponse.refresh_token;
            common_1.commonLogger.info(CortexCredentialProvider, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`);
        }
        common_1.commonLogger.info(CortexCredentialProvider, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`);
        let credItem = {
            accessToken: idpResponse.access_token,
            refreshToken: currentRefreshToken,
            entryPoint: entryPoint,
            datalakeId: datalakeId,
            validUntil: idpResponse.validUntil,
        };
        this.credentials[datalakeId] = credItem;
        let credentialsObject = await this.credentialsObjectFactory(datalakeId, entryPoint, this.accTokenGuardTime, {
            accessToken: idpResponse.access_token,
            validUntil: idpResponse.validUntil
        });
        this.credentialsObject[datalakeId] = credentialsObject;
        await this.createCredentialsItem(datalakeId, credItem);
        common_1.commonLogger.info(CortexCredentialProvider, `Issued new Credentials Object for datalake ID ${datalakeId}`);
        return credentialsObject;
    }
    async registerManualDatalake(datalakeId, entryPoint, refreshToken) {
        return this.issueWithRefreshToken(datalakeId, entryPoint, refreshToken);
    }
    async getCredentialsObject(datalakeId) {
        if (!this.credentials) {
            await this.restoreState();
        }
        if (!this.credentialsObject[datalakeId]) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'CONFIG', `Record for datalake ${datalakeId} not available. Did you forget to register the refresh token?`);
        }
        common_1.commonLogger.info(CortexCredentialProvider, `Providing cached credentials object for datalake ID ${datalakeId}`);
        return this.credentialsObject[datalakeId];
    }
    async deleteDatalake(datalakeId) {
        if (!this.credentials) {
            await this.restoreState();
        }
        let param = {
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
        };
        try {
            await this.idpRevoke(this.idpRevokeUrl, param);
            common_1.commonLogger.info(CortexCredentialProvider, `Successfully revoked refresh token for datalake ${datalakeId}`);
        }
        catch (e) {
            common_1.commonLogger.alert(CortexCredentialProvider, `Non expected revoke response received by IDP ${e}`);
        }
        delete this.credentials[datalakeId];
        await this.deleteCredentialsItem(datalakeId);
        delete this.credentialsObject[datalakeId];
    }
    async retrieveCortexAccessToken(datalakeId) {
        if (!this.credentials) {
            await this.restoreState();
        }
        if (!(datalakeId in this.credentials)) {
            throw new error_1.PanCloudError(CortexCredentialProvider, 'IDENTITY', `Datalake ${datalakeId} not in database`);
        }
        let credentials = this.credentials[datalakeId];
        if (Date.now() + this.accTokenGuardTime * 1000 > credentials.validUntil * 1000) {
            try {
                common_1.commonLogger.info(CortexCredentialProvider, 'Asking for a new access_token');
                let idpResponse = await this.refreshAccessToken(credentials.refreshToken);
                credentials.accessToken = idpResponse.access_token;
                credentials.validUntil = idpResponse.validUntil;
                if (idpResponse.refresh_token) {
                    credentials.refreshToken = idpResponse.refresh_token;
                    common_1.commonLogger.info(CortexCredentialProvider, 'Received new Cortex Refresh Token');
                }
                await this.updateCredentialsItem(datalakeId, credentials);
            }
            catch (_a) {
                common_1.commonLogger.info(CortexCredentialProvider, 'Failed to get a new access token');
            }
        }
        return {
            accessToken: credentials.accessToken,
            validUntil: credentials.validUntil
        };
    }
    parseIdpResponse(obj) {
        if (typeof obj.access_token == 'string' &&
            typeof obj.expires_in == 'string' &&
            (obj.refresh_tokens === undefined || typeof obj.refresh_tokens == 'string')) {
            let expiresIn = Number.parseInt(obj.expires_in);
            if (!isNaN(expiresIn)) {
                return Object.assign({ validUntil: Math.floor(Date.now() / 1000) + expiresIn }, obj);
            }
        }
        throw new error_1.PanCloudError(CortexCredentialProvider, 'PARSER', `Invalid response received by IDP provider`);
    }
    async defaultCredentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch) {
        let credObject = new DefaultCredentials(datalakeId, entryPoint, accTokenGuardTime, this, prefetch);
        common_1.commonLogger.info(CortexCredentialProvider, `Instantiated new credential object from the factory for datalake id ${datalakeId}`);
        return credObject;
    }
}
CortexCredentialProvider.className = 'CortexCredentialProvider';
exports.CortexCredentialProvider = CortexCredentialProvider;
class DefaultCredentialsProvider extends CortexCredentialProvider {
    constructor(ops) {
        super(ops);
        this.className = 'DefaultCredentialsProvider';
        this.sequence = Math.floor(Date.now() * Math.random());
    }
    async createCredentialsItem(datalakeId, credentialsItem) {
        common_1.commonLogger.info(this, 'Stateless credential provider. Discarding new item issued');
    }
    async updateCredentialsItem(datalakeId, credentialsItem) {
        common_1.commonLogger.info(this, 'Stateless credential provider. Discarding updated item');
    }
    async deleteCredentialsItem(datalakeId) {
        common_1.commonLogger.info(this, 'Stateless credential provider. Discarding deleted item');
    }
    async loadCredentialsDb() {
        common_1.commonLogger.info(this, 'Stateless credential provider. Returning an empty item list to load() request');
        return {};
    }
    credentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch) {
        return this.defaultCredentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch);
    }
}
class DefaultCredentials extends credentials_1.Credentials {
    constructor(datalakeId, entryPoint, accTokenGuardTime, supplier, prefetch) {
        super(entryPoint, accTokenGuardTime);
        this.datalakeId = datalakeId;
        this.accessTokenSupplier = supplier;
        if (prefetch) {
            this.setAccessToken(prefetch.accessToken, prefetch.validUntil);
        }
        this.className = 'DefaultCredentials';
    }
    async retrieveAccessToken() {
        let refreshObj = await this.accessTokenSupplier.retrieveCortexAccessToken(this.datalakeId);
        this.setAccessToken(refreshObj.accessToken, refreshObj.validUntil);
        common_1.commonLogger.info(this, `Successfully cached a new access token for datalake ID ${this.datalakeId}`);
    }
}
const ENV_PREFIX = 'PAN';
async function defaultCredentialsProviderFactory(ops) {
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX;
    let envClientId = `${ePrefix}_CLIENT_ID`;
    let envClientSecret = `${ePrefix}_CLIENT_SECRET`;
    let envDefaultRefreshToken = `${ePrefix}_REFRESH_TOKEN`;
    let envEntryPoint = `${ePrefix}_ENTRYPOINT`;
    let cId = (ops && ops.clientId) ? ops.clientId : process_1.env[envClientId];
    if (!cId) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envClientId} not found or empty value`);
    }
    common_1.commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_id'`);
    let cSec = (ops && ops.clientSecret) ? ops.clientSecret : process_1.env[envClientSecret];
    if (!cSec) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envClientSecret} not found or empty value`);
    }
    common_1.commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret'`);
    let rTok = (ops && ops.refreshToken) ? ops.refreshToken : process_1.env[envDefaultRefreshToken];
    if (!rTok) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envDefaultRefreshToken} not found or empty value`);
    }
    let entryPoint = (ops && ops.entryPoint) ? ops.entryPoint : process_1.env[envEntryPoint];
    if (!entryPoint) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envEntryPoint} not found or empty value`);
    }
    return new DefaultCredentialsProvider(Object.assign({ clientId: cId, clientSecret: cSec }, ops)).registerManualDatalake('DEFAULT', entryPoint, rTok);
}
exports.defaultCredentialsProviderFactory = defaultCredentialsProviderFactory;
