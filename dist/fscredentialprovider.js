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
const process_1 = require("process");
const credentialprovider_1 = require("./credentialprovider");
const crypto_1 = require("crypto");
const fs = require("fs");
function isConfigFile(obj) {
    return typeof obj == 'object' &&
        obj.stateSequence && typeof obj.stateSequence == 'number' &&
        obj.authRequests && typeof obj.authRequests == 'object' &&
        obj.credentialItems && typeof obj.credentialItems == 'object' &&
        Object.entries(obj.credentialItems).every(v => typeof v[0] == 'string' && credentialprovider_1.isCredentialItem(v[1])) &&
        obj.refreshTokens && typeof obj.refreshTokens == 'object' &&
        Object.entries(obj.refreshTokens).every(v => typeof v[0] == 'string' && typeof v[1] == 'string');
}
class FsCredProvider extends credentialprovider_1.CortexCredentialProvider {
    constructor(ops) {
        super(ops);
        this.className = 'FsCredProvider';
        this.key = ops.key;
        this.iv = ops.iv;
        this.configFileName = ops.configFileName;
    }
    async fullSync() {
        let configFile = {
            stateSequence: this.seqno,
            credentialItems: this.credentials,
            authRequests: this.authRequests,
            refreshTokens: {}
        };
        Object.entries(this.credentialsRefreshToken).forEach(v => {
            let aes = crypto_1.createCipheriv('aes128', this.key, this.iv);
            let payload = Buffer.concat([aes.update(Buffer.from(v[1], 'utf8')), aes.final()]).toString('base64');
            configFile.refreshTokens[v[0]] = payload;
        });
        await promifyFs(this, fs.writeFile, this.configFileName, JSON.stringify(configFile, undefined, ' '));
    }
    createCortexRefreshToken(datalakeId, refreshToken) {
        common_1.commonLogger.info(this, `Lazy implementation of CREATE refresh token request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    updateCortexRefreshToken(datalakeId, refreshToken) {
        common_1.commonLogger.info(this, `Lazy implementation of UPDATE refresh token request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    deleteCortexRefreshToken(datalakeId) {
        common_1.commonLogger.info(this, `Lazy implementation of DELETE refresh token request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    async retrieveCortexRefreshToken(datalakeId) {
        let configFile = await this.loadConfigFile();
        let cryptedRefreshToken = configFile.refreshTokens[datalakeId];
        if (!cryptedRefreshToken) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Refresh token for datalake ${datalakeId} not found in configuration file ${this.configFileName}`);
        }
        let decr = crypto_1.createDecipheriv('aes128', this.key, this.iv);
        let refreshToken = '';
        try {
            refreshToken = Buffer.concat([decr.update(Buffer.from(cryptedRefreshToken, 'base64')), decr.final()]).toString('utf8');
        }
        catch (_a) {
            throw new error_1.PanCloudError(this, 'PARSER', `Unable to decipher the refresh token for datalake ${datalakeId}. Wrong secret?`);
        }
        common_1.commonLogger.info(this, `Successfully retrieved the refresh token for datalake id ${datalakeId} from the configuration file ${this.configFileName}`);
        return refreshToken;
    }
    createCredentialsItem(datalakeId, credentialsItem) {
        common_1.commonLogger.info(this, `Lazy implementation of CREATE credentials request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    updateCredentialsItem(datalakeId, credentialsItem) {
        common_1.commonLogger.info(this, `Lazy implementation of UPDATE credentials request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    deleteCredentialsItem(datalakeId) {
        common_1.commonLogger.info(this, `Lazy implementation of DELETE credentials request for datalake ${datalakeId} with a full synch operation`);
        return this.fullSync();
    }
    async loadConfigFile() {
        let jsonConfig;
        try {
            let configFile = await promifyFs(this, fs.readFile, this.configFileName);
            jsonConfig = JSON.parse(configFile.toString('utf8'));
        }
        catch (e) {
            throw error_1.PanCloudError.fromError(this, e);
        }
        if (!isConfigFile(jsonConfig)) {
            throw new error_1.PanCloudError(this, 'PARSER', `Invalid configuration file format in ${this.configFileName}`);
        }
        this.seqno = jsonConfig.stateSequence;
        this.authRequests = jsonConfig.authRequests;
        return jsonConfig;
    }
    async loadCredentialsDb() {
        let configFile = await this.loadConfigFile();
        common_1.commonLogger.info(this, `Loaded ${Object.keys(configFile.credentialItems).length} entities from the configuration file ${this.configFileName}`);
        return configFile.credentialItems;
    }
    async requestAuthState(datalakeId, clientParams) {
        let newRequestState = (this.seqno++).toString();
        this.authRequests[newRequestState] = {
            datalakeId: datalakeId,
            clientParams: clientParams
        };
        await this.fullSync();
        common_1.commonLogger.info(this, `Stored new auth request for datalakeId ${datalakeId}. Provided state ${newRequestState}`);
        return newRequestState;
    }
    restoreAuthState(state) {
        if (!this.authRequests[state]) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Unknown authentication state ${state}`);
        }
        common_1.commonLogger.info(this, `Returning authentication state ${state}`);
        return Promise.resolve(this.authRequests[state]);
    }
    deleteAuthState(state) {
        delete this.authRequests[state];
        common_1.commonLogger.info(this, `Deleted auth request state ${state} from storage with a full sync`);
        return this.fullSync();
    }
    credentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch) {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch);
    }
}
const ENV_PREFIX = 'PAN';
const CONFIG_FILE = 'PANCLOUD_CONFIG.json';
async function fsCredentialsFactory(ops) {
    let { key, iv } = passIvGenerator(ops.secret);
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX;
    let envClientId = `${ePrefix}_MASTER_CLIENTID`;
    let envClientSecret = `${ePrefix}_MASTER_CLIENTSECRET`;
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
    let configFileName = `${ePrefix}_${CONFIG_FILE}`;
    try {
        await promifyFs(this, fs.stat, configFileName);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'fsCredProvider' }, `${configFileName} does not exist. Creating it`);
        let blankConfig = {
            stateSequence: Math.floor(Date.now() * Math.random()),
            authRequests: {},
            credentialItems: {},
            refreshTokens: {}
        };
        await promifyFs(this, fs.writeFile, configFileName, JSON.stringify(blankConfig));
    }
    try {
        await promifyFs(this, fs.access, configFileName, fs.constants.W_OK | fs.constants.R_OK);
    }
    catch (e) {
        throw new error_1.PanCloudError({ className: 'fsCredProvider' }, 'CONFIG', `Invalid permissions in configuration file ${configFileName}`);
    }
    return new FsCredProvider(Object.assign({ clientId: cId, clientSecret: cSec, key: key, iv: iv, configFileName: configFileName }, ops));
}
exports.fsCredentialsFactory = fsCredentialsFactory;
function passIvGenerator(secret) {
    let code = crypto_1.createHash('sha1').update(secret).digest();
    let key = new DataView(code.buffer.slice(0, 16));
    let iv = new DataView(code.buffer.slice(4, 20));
    return {
        key: key,
        iv: iv
    };
}
function promifyFs(source, f, ...params) {
    return new Promise((resolve, reject) => {
        f(...params, (e, data) => {
            if (e) {
                reject(error_1.PanCloudError.fromError(source, e));
            }
            resolve(data);
        });
    });
}
