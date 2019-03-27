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
        obj.credentialItems && typeof obj.credentialItems == 'object' &&
        Object.entries(obj.credentialItems).every(v => typeof v[0] == 'string' && credentialprovider_1.isCredentialItem(v[1]));
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
            credentialItems: this.credentials
        };
        Object.entries(this.credentials).forEach(v => {
            let aes = crypto_1.createCipheriv('aes128', this.key, this.iv);
            let payload = Buffer.concat([aes.update(Buffer.from(v[1].refreshToken, 'utf8')), aes.final()]).toString('base64');
            configFile.credentialItems[v[0]].refreshToken = payload;
            aes = crypto_1.createCipheriv('aes128', this.key, this.iv);
            payload = Buffer.concat([aes.update(Buffer.from(v[1].accessToken, 'utf8')), aes.final()]).toString('base64');
            configFile.credentialItems[v[0]].accessToken = payload;
        });
        await promifyFs(this, fs.writeFile, this.configFileName, JSON.stringify(configFile, undefined, ' '));
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
    async loadCredentialsDb() {
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
        Object.entries(jsonConfig.credentialItems).forEach(v => {
            let aes = crypto_1.createDecipheriv('aes128', this.key, this.iv);
            let payload = Buffer.concat([aes.update(Buffer.from(v[1].refreshToken, 'base64')), aes.final()]).toString('utf8');
            jsonConfig.credentialItems[v[0]].refreshToken = payload;
            aes = crypto_1.createDecipheriv('aes128', this.key, this.iv);
            payload = Buffer.concat([aes.update(Buffer.from(v[1].accessToken, 'base64')), aes.final()]).toString('utf8');
            jsonConfig.credentialItems[v[0]].accessToken = payload;
        });
        common_1.commonLogger.info(this, `Loaded ${Object.keys(jsonConfig.credentialItems).length} entities from the configuration file ${this.configFileName}`);
        return jsonConfig.credentialItems;
    }
    credentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch) {
        return this.defaultCredentialsObjectFactory(datalakeId, entryPoint, accTokenGuardTime, prefetch);
    }
}
const ENV_PREFIX = 'PAN';
const CONFIG_FILE = 'PANCLOUD_CONFIG.json';
async function fsCredentialsFactory(ops) {
    let { key, iv } = passIvGenerator(ops.secret);
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX;
    let envClientId = `${ePrefix}_CLIENT_ID`;
    let envClientSecret = `${ePrefix}_CLIENT_SECRET`;
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
            credentialItems: {}
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
    let key = code.slice(0, 16);
    let iv = code.slice(4, 20);
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
