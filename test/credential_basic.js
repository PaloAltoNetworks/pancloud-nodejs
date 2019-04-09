"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const process_1 = require("process");
async function main() {
    let accessToken = process_1.env['PAN_ACCESS_TOKEN'];
    if (!accessToken) {
        throw new Error(`environmental variable PAN_ACCESS_TOKEN does not exist is null`);
    }
    let c = await pancloud_nodejs_1.defaultCredentialsFactory('https://api.us.paloaltonetworks.com', accessToken);
    let d = new Date(await c.getExpiration() * 1000);
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`);
}
exports.main = main;
