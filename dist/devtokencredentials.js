"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = require("process");
const node_fetch_1 = require("node-fetch");
const credentials_1 = require("./credentials");
const common_1 = require("./common");
const error_1 = require("./error");
const ENV_DEVELOPER_TOKEN = 'PAN_DEVELOPER_TOKEN';
const ENV_DEVELOPER_TOKEN_PROVIDER = 'PAN_DEVELOPER_TOKEN_PROVIDER';
const DEV_TOKEN_PROVIDER = 'https://app.apiexplorer.rocks/request_token';
function isApexResponse(obj) {
    return obj && typeof obj == 'object' &&
        obj.access_token && typeof obj.access_token == 'string';
}
class DevTokenCredentials extends credentials_1.Credentials {
    constructor(devToken, devTokenProvider, accesToken) {
        super(accesToken);
        this.developerToken = devToken;
        this.developerTokenProvider = devTokenProvider;
    }
    static async factory(ops) {
        let envDevToken = (ops && ops.envDevToken) ? ops.envDevToken : ENV_DEVELOPER_TOKEN;
        let envDevTokenProvider = (ops && ops.envDevTokenProvider) ? ops.envDevTokenProvider : ENV_DEVELOPER_TOKEN_PROVIDER;
        let developerToken = (ops && ops.developerToken) ? ops.developerToken : process_1.env[envDevToken];
        if (!developerToken) {
            throw new error_1.PanCloudError(DevTokenCredentials, 'PARSER', `Environmental variable ${envDevToken} does not exists or contains null data`);
        }
        let tokenProvider = (ops && ops.developerTokenProvider) ? ops.developerTokenProvider : process_1.env[envDevTokenProvider];
        let finalTokenProvider = tokenProvider ? tokenProvider : DEV_TOKEN_PROVIDER;
        let accessToken = await DevTokenCredentials.devTokenConsume(finalTokenProvider, developerToken);
        return new DevTokenCredentials(developerToken, finalTokenProvider, accessToken);
    }
    static async devTokenConsume(entrypoint, token) {
        let res = await common_1.retrier(DevTokenCredentials, undefined, undefined, node_fetch_1.default, entrypoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            throw new error_1.PanCloudError(DevTokenCredentials, 'UNKNOWN', `non 200 Response from the Developer Token Provider at ${entrypoint}`);
        }
        let rJson;
        try {
            rJson = await res.json();
        }
        catch (exception) {
            throw new error_1.PanCloudError(DevTokenCredentials, 'PARSER', `non valid JSON content received from the Developer Token Provider at ${entrypoint}`);
        }
        if (isApexResponse(rJson)) {
            return rJson.access_token;
        }
        throw new error_1.PanCloudError(DevTokenCredentials, 'PARSER', `non valid access_token property found in the response received from the Developer Token Provider at ${entrypoint}`);
    }
    async refreshAccessToken() {
        this.setAccessToken(await DevTokenCredentials.devTokenConsume(this.developerTokenProvider, this.developerToken));
    }
    async revokeToken() {
    }
}
DevTokenCredentials.className = 'DevTokenCredentials';
exports.DevTokenCredentials = DevTokenCredentials;