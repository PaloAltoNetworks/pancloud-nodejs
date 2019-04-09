"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let containers = await dss.query('containers');
    console.log(`Sucessfully Received ${containers.count} container objects`);
    containers.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`);
        console.log(JSON.stringify(x, undefined, ' '));
    });
    console.log(`Page Number: ${containers.pageNumber}`);
    console.log(`Page Size: ${containers.pageSize}`);
    if (containers.unreadResults) {
        console.log(`Unread Results: ${containers.unreadResults}`);
    }
}
exports.main = main;
