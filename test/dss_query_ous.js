"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let ous = await dss.query('ous');
    console.log(`Sucessfully Received ${ous.count} ou objects`);
    ous.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`);
        console.log(JSON.stringify(x, undefined, ' '));
    });
    console.log(`Page Number: ${ous.pageNumber}`);
    console.log(`Page Size: ${ous.pageSize}`);
    if (ous.unreadResults) {
        console.log(`Unread Results: ${ous.unreadResults}`);
    }
}
exports.main = main;
