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
/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
const common_1 = require("./common");
const error_1 = require("./error");
/**
 * Base abstract CredentialS class
 */
class Credentials {
    constructor(entryPoint, guardTime) {
        this.entryPoint = entryPoint;
        this.guardTime = (guardTime) ? guardTime : 300;
        this.className = "Credentials";
        if (this.guardTime > 3300) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Property 'accTokenGuardTime' must be, at max 3300 seconds (${this.guardTime})`);
        }
    }
    setAccessToken(accessToken, validUntil) {
        this.accessToken = accessToken;
        this.validUntil = validUntil;
    }
    /**
     * Returns the current access token
     */
    async getAccessToken() {
        if (!this.accessToken) {
            await this.retrieveAccessToken();
        }
        return this.accessToken;
    }
    async getExpiration() {
        if (!this.accessToken) {
            await this.retrieveAccessToken();
        }
        return this.validUntil;
    }
    getEntryPoint() {
        return this.entryPoint;
    }
    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    async autoRefresh() {
        if (!this.accessToken) {
            await this.retrieveAccessToken();
        }
        if (Date.now() + this.guardTime * 1000 > this.validUntil * 1000) {
            try {
                common_1.commonLogger.info(this, 'Cached access token about to expire. Requesting a new one.');
                await this.retrieveAccessToken();
                return this.validUntil;
            }
            catch (_a) {
                common_1.commonLogger.info(this, 'Failed to get a new access token');
            }
        }
        return this.validUntil;
    }
}
exports.Credentials = Credentials;
class StaticCredentials extends Credentials {
    constructor(entryPoint, accessToken) {
        super(entryPoint);
        this.className = 'StaticCredentials';
        let parts = accessToken.split('.');
        if (parts.length != 3) {
            throw new error_1.PanCloudError(this, 'CONFIG', 'not a valid JWT access token');
        }
        let validUntil = 0;
        try {
            let claim = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            if (!(claim.exp && typeof claim.exp == 'number')) {
                throw new error_1.PanCloudError(this, 'CONFIG', `JWT claim does not include "exp" field (${parts[1]})`);
            }
            validUntil = claim.exp;
        }
        catch (e) {
            throw new error_1.PanCloudError(this, 'PARSER', 'Unable to decode the JWT access token');
        }
        this.setAccessToken(accessToken, validUntil);
    }
    retrieveAccessToken() {
        common_1.commonLogger.info(this, 'This is a static credentials class. Do not support refresh operations.');
        return Promise.resolve();
    }
}
/**
 * Initializes a static (meant to be used for testing and quick starting) Credentials object. Please
 * note that the returned object won't refresh the token at all.
 * @param entryPoint Cortex Hub regional API entry point
 * @param accessToken OAUTH2 `access_token` value.
 */
function defaultCredentialsFactory(entryPoint, accessToken) {
    return new StaticCredentials(entryPoint, accessToken);
}
exports.defaultCredentialsFactory = defaultCredentialsFactory;
