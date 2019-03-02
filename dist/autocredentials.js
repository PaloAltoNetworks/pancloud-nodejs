"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const oa2credentials_1 = require("./oa2credentials");
const devtokencredentials_1 = require("./devtokencredentials");
const common_1 = require("./common");
const error_1 = require("./error");
async function autoCredentials(opt) {
    try {
        return await oa2credentials_1.EnvCredentials.factory(opt);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate EnvCredentials class with message ${e.message}`);
    }
    try {
        return await oa2credentials_1.FileCredentials.factory(opt);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate FileCredentials class with message ${e.message}`);
    }
    try {
        return await devtokencredentials_1.DevTokenCredentials.factory(opt);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate DevTokenCredentials class with message ${e.message}`);
    }
    throw new error_1.PanCloudError({ className: 'AutoCredentials' }, 'PARSER', 'Unable to instantiate a Credentials class');
}
exports.autoCredentials = autoCredentials;
