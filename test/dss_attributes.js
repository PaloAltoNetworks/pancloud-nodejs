"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let attr = await dss.attributes();
    console.log("Sucessfully Received Attributes");
    console.log(JSON.stringify(attr, undefined, ' '));
}
exports.main = main;
