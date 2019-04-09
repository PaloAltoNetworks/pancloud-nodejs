"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    await es.ack();
    console.log("Sucessfully ack'ed the channel");
}
exports.main = main;
