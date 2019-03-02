"use strict";
/**
 * credentials module implements a class to keep all Application Framework credentials operations
 * bound together.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const error_1 = require("./error");
const common_1 = require("./common");
/**
 * Base abstract CredentialS class
 */
class Credentials {
    constructor(accessToken, expiresIn) {
        this.accessToken = accessToken;
        this.validUntil = Credentials.validUntil(accessToken, expiresIn);
        this.className = "Credentials";
    }
    static validUntil(accessToken, expiresIn) {
        if (expiresIn) {
            return Math.floor(Date.now() / 1000) + expiresIn;
        }
        let exp = 0;
        if (accessToken) {
            let jwtParts = accessToken.split('.');
            if (jwtParts.length != 3) {
                throw new error_1.PanCloudError({ className: 'Credentials' }, 'CONFIG', 'invalid JWT Token');
            }
            let claim;
            try {
                claim = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
                exp = Number.parseInt(claim.exp, 10);
            }
            catch (e) {
                throw error_1.PanCloudError.fromError({ className: 'Credentials' }, e);
            }
        }
        return exp;
    }
    setAccessToken(accessToken, expiresIn) {
        this.accessToken = accessToken;
        this.validUntil = Credentials.validUntil(accessToken, expiresIn);
    }
    /**
     * Returns the current access token
     */
    getAccessToken() {
        return this.accessToken;
    }
    /**
     * Returns the current access token expiration time
     */
    getExpiration() {
        return this.validUntil;
    }
    /**
     * Checks the access token expiration time and automaticaly refreshes it if going to expire
     * inside the next 5 minutes
     */
    async autoRefresh() {
        if (Date.now() + 300000 > this.validUntil * 1000) {
            try {
                common_1.commonLogger.info(this, 'Attempt to auto-refresh the access token');
                await this.refreshAccessToken();
                return true;
            }
            catch (_a) {
                common_1.commonLogger.info(this, 'Failed to auto-refresh the access token');
            }
        }
        return false;
    }
}
exports.Credentials = Credentials;
