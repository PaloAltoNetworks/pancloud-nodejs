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
const credentialprovider_1 = require("./credentialprovider");
const devtokencredentials_1 = require("./devtokencredentials");
const credentials_1 = require("./credentials");
const common_1 = require("./common");
const error_1 = require("./error");
const process_1 = require("process");
async function autoCredentials(opt) {
    let envClientId = process_1.env['PAN_CLIENT_ID'];
    let envClientSecret = process_1.env['PAN_CLIENT_SECRET'];
    let envRefreshToken = (opt && opt.refreshToken) || process_1.env['PAN_REFRESH_TOKEN'];
    let envAccessToken = (opt && opt.accessToken) || process_1.env['PAN_ACCESS_TOKEN'];
    let envEntryPoint = process_1.env['PAN_ENTRYPOINT'];
    let entryPoint = 'https://api.us.paloaltonetworks.com';
    if (envEntryPoint) {
        entryPoint = envEntryPoint;
    }
    else {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, 'Environmental variable PAN_ENTRYPOINT not set. Assuming https://api.us.paloaltonetworks.com');
    }
    if (!(envAccessToken || (envClientId && envClientSecret && envRefreshToken))) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, 'Neither "PAN_ACCESS_TOKEN" (for static credentials) nor "PAN_CLIENT_ID", "PAN_CLIENT_SECRET" and "PAN_REFRESH_TOKEN" for a memory-based credentials provider where provider. Will try with developer token credetials');
        let devTokCredentias = new devtokencredentials_1.DevTokenCredentials(Object.assign({ entryPoint: entryPoint }, opt));
        await devTokCredentias.retrieveAccessToken();
        return devTokCredentias;
    }
    if (envClientId && envClientSecret && envRefreshToken) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, 'Using memory based credentials provider');
        return credentialprovider_1.defaultCredentialsProviderFactory(Object.assign({ clientId: envClientId, clientSecret: envClientSecret, refreshToken: envRefreshToken, entryPoint: entryPoint }, opt));
    }
    if (envAccessToken) {
        common_1.commonLogger.info({ className: 'AutoCredentials' }, 'Using startic credentials. No refresh available.');
        return credentials_1.defaultCredentialsFactory(entryPoint, envAccessToken);
    }
    throw new error_1.PanCloudError({ className: 'AutoCredentials' }, 'CONFIG', 'Unknown error');
}
exports.autoCredentials = autoCredentials;
