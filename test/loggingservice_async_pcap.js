"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const fs_1 = require("fs");
let now = Math.floor(Date.now() / 1000);
let query = {
    query: 'select * from panw.threat limit 40',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        pcap: receiver
    }
};
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, { fetchTimeout: 45000 });
    await ls.query(query); // Schedule query 1 and register the receiver
    console.log("Logging Service stats");
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "));
}
exports.main = main;
let pcapCounter = 0;
function receiver(e) {
    if (e.message) {
        fs_1.writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message);
        console.log(`Received PCAP body of ${e.message.length} bytes`);
    }
}
