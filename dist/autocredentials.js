"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const credentialprovider_1 = require("./credentialprovider");
const devtokencredentials_1 = require("./devtokencredentials");
const credentials_1 = require("./credentials");
const common_1 = require("./common");
const error_1 = require("./error");
async function autoCredentials(opt) {
    try {
        return await credentialprovider_1.defaultCredentialsProviderFactory(opt);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate Default Credential class with message ${e.message}`);
    }
    try {
        let devTokCredentias = new devtokencredentials_1.DevTokenCredentials(opt);
        await devTokCredentias.retrieveAccessToken();
        return devTokCredentias;
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate DevTokenCredentials class with message ${e.message}`);
    }
    if (opt && opt.accessToken) {
        try {
            return credentials_1.defaultCredentialsFactory(opt.accessToken);
        }
        catch (e) {
            common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate Static Credential class with message ${e.message}`);
        }
    }
    throw new error_1.PanCloudError({ className: 'AutoCredentials' }, 'PARSER', 'Unable to instantiate a Credentials class');
}
exports.autoCredentials = autoCredentials;
