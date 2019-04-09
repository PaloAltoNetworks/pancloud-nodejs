"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let groups = await dss.query('groups');
    console.log(`Sucessfully Received ${groups.count} group objects`);
    groups.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`);
        console.log(JSON.stringify(x, undefined, ' '));
    });
    console.log(`Page Number: ${groups.pageNumber}`);
    console.log(`Page Size: ${groups.pageSize}`);
    if (groups.unreadResults) {
        console.log(`Unread Results: ${groups.unreadResults}`);
    }
}
exports.main = main;
