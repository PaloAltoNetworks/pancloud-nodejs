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
const fs_1 = require("fs");
function isConfigFile(obj) {
    return typeof obj == 'object' &&
        obj.credentialItems && typeof obj.credentialItems == 'object' &&
        Object.entries(obj.credentialItems).every(v => typeof v[0] == 'string' && credentialprovider_1.isCredentialItem(v[1])) &&
        obj.refreshTokens && typeof obj.refreshTokens == 'object' &&
        Object.entries(obj.refreshTokens).every(v => typeof v[0] == 'string' && typeof v[1] == 'string');
}
class FsCredProvider extends credentialprovider_1.CortexCredentialProvider {
    constructor(ops) {
        super(ops);
        this.key = ops.key;
        this.iv = ops.iv;
        this.configFileName = this.configFileName;
    }
    async fullSync() {
        let configFile = {
            credentialItems: this.credentials,
            refreshTokens: {}
        };
        Object.entries(this.credentialsRefreshToken).forEach(v => {
            let aes = crypto_1.createCipheriv('aes-128-ccm', this.key, this.iv);
            aes.update(v[1]);
            configFile.refreshTokens[v[0]] = aes.final('base64');
        });
        try {
            await fs_1.promises.writeFile(this.configFileName, JSON.stringify(configFile));
        }
        catch (e) {
            throw error_1.PanCloudError.fromError(this, e);
        }
    }
    createCortexRefreshToken(datalakeId, refreshToken) {
        return this.fullSync();
    }
    updateCortexRefreshToken(datalakeId, refreshToken) {
        return this.fullSync();
    }
    deleteCortexRefreshToken(datalakeId) {
        return this.fullSync();
    }
    async retrieveCortexRefreshToken(datalakeId) {
        let configFile = await this.loadConfigFile();
        let cryptedRefreshToken = configFile.refreshTokens[datalakeId];
        if (!cryptedRefreshToken) {
            throw new error_1.PanCloudError(this, 'CONFIG', `Refresh token for datalake ${datalakeId} not found in configuration file ${this.configFileName}`);
        }
        let decr = crypto_1.createDecipheriv('aes-128-ccm', this.key, this.iv);
        decr.update(Buffer.from(cryptedRefreshToken, 'base64'));
        return decr.final('utf8');
    }
    createCredentialsItem(datalakeId, credentialsItem) {
        return this.fullSync();
    }
    updateCredentialsItem(datalakeId, credentialsItem) {
        return this.fullSync();
    }
    deleteCredentialsItem(datalakeId) {
        return this.fullSync();
    }
    async loadConfigFile() {
        let jsonConfig;
        try {
            let configFile = await fs_1.promises.readFile(this.configFileName);
            jsonConfig = JSON.parse(configFile.toString('utf8'));
        }
        catch (e) {
            throw error_1.PanCloudError.fromError(this, e);
        }
        if (!isConfigFile(jsonConfig)) {
            throw new error_1.PanCloudError(this, 'PARSER', `Invalid configuration file format in ${this.configFileName}`);
        }
        return jsonConfig;
    }
    async loadCredentialsDb() {
        let configFile = await this.loadConfigFile();
        return configFile.credentialItems;
    }
    credentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch) {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch);
    }
}
const ENV_PREFIX = 'PAN';
const CONFIG_FILE = 'pancloud_config.js';
async function fsCredProvider(ops) {
    let { key, iv } = passIvGenerator(ops.secret);
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
    let configFileName = `${ePrefix}_${CONFIG_FILE}`;
    try {
        await fs_1.promises.stat(configFileName);
    }
    catch (e) {
        common_1.commonLogger.info({ className: 'fsCredProvider' }, `${configFileName} does not exist. Creating it`);
        let blankConfig = {
            credentialItems: {},
            refreshTokens: {}
        };
        await fs_1.promises.writeFile(configFileName, JSON.stringify(blankConfig));
    }
    try {
        await fs_1.promises.access(configFileName, fs_1.constants.W_OK | fs_1.constants.R_OK);
    }
    catch (e) {
        throw new error_1.PanCloudError({ className: 'fsCredProvider' }, 'CONFIG', `Invalid permissions in configuration file ${configFileName}`);
    }
    return new FsCredProvider(Object.assign({ clientId: cId, clientSecret: cSec, key: key, iv: iv, configFileName: configFileName }, ops));
}
exports.fsCredProvider = fsCredProvider;
function passIvGenerator(secret) {
    let code = crypto_1.createHash('sha1').update(secret).digest();
    return {
        key: code.toString('utf8', 0, 16),
        iv: code.toString('utf8', 16, 32)
    };
}
