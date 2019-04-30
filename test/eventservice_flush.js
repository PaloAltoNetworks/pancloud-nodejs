"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    await es.flush();
    console.log("Successfully flushed the channel");
}
exports.main = main;
