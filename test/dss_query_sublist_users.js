"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const entryPoint = "https://api.us.paloaltonetworks.com";
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let dss = await pancloud_nodejs_1.DirectorySyncService.factory(c);
    let users = await dss.query('users', {
        domain: "panwdomain",
        name: {
            attributeName: 'Common-Name',
            attributeValue: 'Adm',
            matchCriteria: 'startWith'
        }
    });
    console.log(`Sucessfully Received ${users.count} user objects`);
    users.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`);
        console.log(JSON.stringify(x, undefined, ' '));
    });
    console.log(`Page Number: ${users.pageNumber}`);
    console.log(`Page Size: ${users.pageSize}`);
    if (users.unreadResults) {
        console.log(`Unread Results: ${users.unreadResults}`);
    }
}
exports.main = main;
