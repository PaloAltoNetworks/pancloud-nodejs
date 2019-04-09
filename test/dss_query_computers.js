"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let computers = await dss.query('computers');
    console.log(`Sucessfully Received ${computers.count} computer objects`);
    computers.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`);
        console.log(JSON.stringify(x, undefined, ' '));
    });
    console.log(`Page Number: ${computers.pageNumber}`);
    console.log(`Page Size: ${computers.pageSize}`);
    if (computers.unreadResults) {
        console.log(`Unread Results: ${computers.unreadResults}`);
    }
}
exports.main = main;
