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
        this.className = 'CortexCredentialProvider';
        this.clientId = ops.clientId;
        this.clientSecret = ops.clientSecret;
        this.idpTokenUrl = (ops.idpTokenUrl) ? ops.idpTokenUrl : IDP_TOKEN_URL;
        this.idpRevokeUrl = (ops.idpRevokeUrl) ? ops.idpRevokeUrl : IDP_REVOKE_URL;
        this.accTokenGuardTime = (ops.accTokenGuardTime) ? ops.accTokenGuardTime : ACCESS_GUARD;
        this.retrierAttempts = ops.retrierAttempts;
        this.retrierDelay = ops.retrierDelay;
        if (this.accTokenGuardTime > 3300) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.accTokenGuardTime})`);
        }
    }
    async idpInterface(url, param) {
        let res = await common_1.retrier(this, this.retrierAttempts, this.retrierDelay, fetch_1.fetch, url, param);
        if (!res.ok) {
            throw new error_1.PanCloudError(this, 'IDENTITY', `HTTP Error from IDP refresh operation ${res.status} ${res.statusText}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(this, 'PARSER', `Invalid JSON refresh response: ${exception.message}`);
        }
        if (isIdpErrorResponse(rJson)) {
            throw new error_1.PanCloudError(this, 'IDENTITY', rJson.error_description);
        }
        try {
            let augmentedResponse = this.parseIdpResponse(rJson);
            common_1.commonLogger.info(this, 'Authorization token successfully retrieved', 'IDENTITY');
            return augmentedResponse;
        }
        catch (_a) {
            throw new error_1.PanCloudError(this, 'PARSER', `Unparseable response received from IDP refresh operation: '${JSON.stringify(rJson)}'`);
        }
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
        return this.idpInterface(this.idpTokenUrl, param);
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
        return this.idpInterface(this.idpTokenUrl, param);
    }
    async restoreState() {
        this.credentials = await this.loadCredentialsDb();
        this.credentialsRefreshToken = {};
        this.credentialsObject = {};
        for (let datalakeId in this.credentials) {
            if (!this.credentialsRefreshToken[datalakeId]) {
                try {
                    this.credentialsRefreshToken[datalakeId] = await this.retrieveCortexRefreshToken(datalakeId);
                    this.credentialsObject[datalakeId] = await this.credentialsObjectFactory(datalakeId, this.accTokenGuardTime);
                }
                catch (_a) {
                    common_1.commonLogger.info(this, `Refresh Token for datalake ${datalakeId} not available at restore time`);
                }
            }
        }
        common_1.commonLogger.info(this, `Successfully restored ${Object.keys(this.credentials).length} items`);
    }
    async settleCredObject(datalakeId, accessToken, validUntil) {
        let credentialsObject = await this.credentialsObjectFactory(datalakeId, this.accTokenGuardTime, {
            accessToken: accessToken,
            validUntil: validUntil
        });
        let credItem = {
            accessToken: accessToken,
            datalakeId: datalakeId,
            validUntil: validUntil,
        };
        this.credentials[datalakeId] = credItem;
        this.credentialsObject[datalakeId] = credentialsObject;
        await this.createCredentialsItem(datalakeId, credItem);
        common_1.commonLogger.info(this, `Issued new Credentials Object for datalake ID ${datalakeId}`);
        return credentialsObject;
    }
    async issueWithRefreshToken(datalakeId, refreshToken) {
        if (!this.credentials) {
            await this.restoreState();
        }
        if (this.credentialsRefreshToken[datalakeId] == refreshToken) {
            return this.issueCredentialsObject(datalakeId);
        }
        if (!this.credentialsRefreshToken[datalakeId]) {
            this.credentialsRefreshToken[datalakeId] = refreshToken;
            await this.createCortexRefreshToken(datalakeId, refreshToken);
        }
        else {
            this.credentialsRefreshToken[datalakeId] = refreshToken;
            await this.updateCortexRefreshToken(datalakeId, refreshToken);
        }
        let idpResponse = await this.refreshAccessToken(refreshToken);
        if (idpResponse.refresh_token) {
            this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token;
            common_1.commonLogger.info(this, `Received new Cortex Refresh Token for datalake ID ${datalakeId} from Identity Provider`);
            await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token);
        }
        common_1.commonLogger.info(this, `Retrieved Access Token for datalake ID ${datalakeId} from Identity Provider`);
        return this.settleCredObject(datalakeId, idpResponse.access_token, idpResponse.validUntil);
    }
    async registerCodeDatalake(datalakeId, code, redirectUri) {
        let idpResponse = await this.fetchTokens(code, redirectUri);
        if (!idpResponse.refresh_token) {
            throw new error_1.PanCloudError(this, 'IDENTITY', 'Identity response does not include a refresh token');
        }
        return this.issueWithRefreshToken(datalakeId, idpResponse.refresh_token);
    }
    async registerManualDatalake(datalakeId, refreshToken) {
        return this.issueWithRefreshToken(datalakeId, refreshToken);
    }
    async issueCredentialsObject(datalakeId) {
        if (!this.credentials) {
            await this.restoreState();
        }
        if (this.credentials[datalakeId]) {
            common_1.commonLogger.info(this, `Providing cached credentials object for datalake ID ${datalakeId}`);
            return this.credentialsObject[datalakeId];
        }
        let refreshToken = await this.retrieveCortexRefreshToken(datalakeId);
        common_1.commonLogger.info(this, `Retrieved Cortex Refresh Token for datalake ID ${datalakeId} from Store`);
        return this.issueWithRefreshToken(datalakeId, refreshToken);
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
                "token": this.credentialsRefreshToken[datalakeId],
                "token_type_hint": "refresh_token"
            })
        };
        await this.idpInterface(this.idpRevokeUrl, param);
        delete this.credentialsRefreshToken[datalakeId];
        await this.deleteCortexRefreshToken(datalakeId);
        delete this.credentials[datalakeId];
        await this.deleteCredentialsItem(datalakeId);
        delete this.credentialsObject[datalakeId];
    }
    async retrieveCortexAccessToken(datalakeId) {
        if (!this.credentials) {
            await this.restoreState();
        }
        if (!(datalakeId in this.credentials)) {
            throw new error_1.PanCloudError(this, 'IDENTITY', `Datalake ${datalakeId} not in database`);
        }
        let credentials = this.credentials[datalakeId];
        if (Date.now() + this.accTokenGuardTime * 1000 > credentials.validUntil * 1000) {
            try {
                common_1.commonLogger.info(this, 'Asking for a new access_token');
                let idpResponse = await this.refreshAccessToken(this.credentialsRefreshToken[datalakeId]);
                credentials.accessToken = idpResponse.access_token;
                credentials.validUntil = idpResponse.validUntil;
                if (idpResponse.refresh_token) {
                    this.credentialsRefreshToken[datalakeId] = idpResponse.refresh_token;
                    common_1.commonLogger.info(this, 'Received new Cortex Refresh Token');
                    await this.updateCortexRefreshToken(datalakeId, idpResponse.refresh_token);
                }
                await this.updateCredentialsItem(datalakeId, credentials);
            }
            catch (_a) {
                common_1.commonLogger.info(this, 'Failed to get a new access token');
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
        throw new error_1.PanCloudError(this, 'PARSER', `Invalid response received by IDP provider`);
    }
    async defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch) {
        let credObject = new DefaultCredentials(datalakeId, accTokenGuardTime, this);
        if (prefetch) {
            credObject.putAccessToken(prefetch.accessToken, prefetch.validUntil);
        }
        common_1.commonLogger.info(this, `Instantiated new credential object from the factory for datalake id ${datalakeId}`);
        return credObject;
    }
}
exports.CortexCredentialProvider = CortexCredentialProvider;
class DefaultCredentialsProvider extends CortexCredentialProvider {
    constructor(ops) {
        super(ops);
        this.className = 'DefaultCredentialsProvider';
        this.envPrefix = ops.envPrefix;
    }
    createCortexRefreshToken(datalakeId, refreshToken) {
        return this.updateCortexRefreshToken(datalakeId, refreshToken);
    }
    async updateCortexRefreshToken(datalakeId, refreshToken) {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`;
        process_1.env[environmentVariable] = refreshToken;
        common_1.commonLogger.info(this, `Updated environment variable ${environmentVariable} with new refresh token`);
    }
    async deleteCortexRefreshToken(datalakeId) {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`;
        delete process_1.env[environmentVariable];
        common_1.commonLogger.info(this, `Deleted environment variable ${environmentVariable}`);
    }
    async retrieveCortexRefreshToken(datalakeId) {
        let environmentVariable = `${this.envPrefix}_REFRESH_${datalakeId}`;
        let refreshToken = process_1.env[environmentVariable];
        if (!refreshToken) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Environment variable ${environmentVariable} not found or empty value`);
        }
        common_1.commonLogger.info(this, `Retrieved refresh token for datalake id ${datalakeId} from environment variable ${environmentVariable}`);
        return refreshToken;
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
    credentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch) {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch);
    }
}
class DefaultCredentials extends credentials_1.Credentials {
    constructor(datalakeId, accTokenGuardTime, supplier) {
        super(accTokenGuardTime);
        this.datalakeId = datalakeId;
        this.accessTokenSupplier = supplier;
        this.className = 'DefaultCredentials';
    }
    async retrieveAccessToken() {
        let refreshObj = await this.accessTokenSupplier.retrieveCortexAccessToken(this.datalakeId);
        this.setAccessToken(refreshObj.accessToken, refreshObj.validUntil);
        common_1.commonLogger.info(this, `Successfully cached a new access token for datalake ID ${this.datalakeId}`);
    }
    putAccessToken(accessToken, validUntil) {
        return this.setAccessToken(accessToken, validUntil);
    }
}
const ENV_PREFIX = 'PAN';
async function defaultCredentialsFactory(ops) {
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX;
    let envClientId = `${ePrefix}_MASTER_CLIENTID`;
    let envClientSecret = `${ePrefix}_MASTER_CLIENTSECRET`;
    let cId = (ops && ops.clientId) ? ops.clientId : process_1.env[envClientId];
    if (!cId) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envClientId} not found or empty value`);
    }
    common_1.commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_id' from environment variable ${envClientId}`);
    let cSec = (ops && ops.clientSecret) ? ops.clientSecret : process_1.env[envClientSecret];
    if (!cSec) {
        throw new error_1.PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG', `Environment variable ${envClientSecret} not found or empty value`);
    }
    common_1.commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret' from environment variable ${envClientSecret}`);
    return new DefaultCredentialsProvider(Object.assign({ envPrefix: ePrefix, clientId: cId, clientSecret: cSec }, ops)).issueCredentialsObject('DEFAULT');
}
exports.defaultCredentialsFactory = defaultCredentialsFactory;
