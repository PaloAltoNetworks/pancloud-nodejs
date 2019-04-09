"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    console.log("Retrieving count per object classes");
    for (let i of ["computers", "containers", "groups", "users"]) {
        let count = await dss.count("panwdomain", i);
        console.log(`${i}: ${count}`);
    }
}
exports.main = main;
