"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    let t = await es.poll();
    t.forEach(e => {
        console.log(`Event Type: ${e.logType}, Record Count: ${e.event.length}`);
        console.log(`First Event\n${JSON.stringify(e.event[0])}`);
    });
}
exports.main = main;
