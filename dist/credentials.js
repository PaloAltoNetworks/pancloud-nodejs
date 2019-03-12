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
