"use strict";
/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const error_1 = require("./error");
/**
 * Base abstract CredentialS class
 */
class Credentials {
    constructor(guardTime) {
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
                return true;
            }
            catch (_a) {
                common_1.commonLogger.info(this, 'Failed to get a new access token');
            }
        }
        return false;
    }
}
exports.Credentials = Credentials;
class StaticCredentials extends Credentials {
    constructor(accessToken) {
        super();
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
function defaultCredentialsFactory(accessToken) {
    return new StaticCredentials(accessToken);
}
exports.defaultCredentialsFactory = defaultCredentialsFactory;
