"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let attr = await dss.domains();
    console.log("Sucessfully Received Domains");
    attr.forEach((v, i) => {
        console.log(`${i}: ${JSON.stringify(v)}`);
    });
}
exports.main = main;
