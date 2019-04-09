"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const process_1 = require("process");
async function main() {
    let refreshToken = process_1.env['PAN_REFRESH_TOKEN'];
    if (!refreshToken) {
        throw new Error('Provide a valid refresh token in the PAN_REFRESH_TOKEN environment variable');
    }
    let credProv = await pancloud_nodejs_1.fsCredentialsFactory({ secret: 'mysecret' });
    let c = await credProv.registerManualDatalake('hello', 'https://api.us.paloaltonetworks.com', refreshToken);
    let d = new Date(await c.getExpiration() * 1000);
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`);
}
exports.main = main;
