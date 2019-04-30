"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let now = Math.floor(Date.now() / 1000);
let query = {
    query: "select * from panw.dpi where subtype='dns' limit 40",
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        event: receiver
    }
};
let decodingErrors = 0;
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, { fetchTimeout: 45000 });
    await ls.query(query); // Schedule query 1 and register the receiver
    console.log("Logging Service stats");
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "));
    console.log(`DNS Decoding Errorr: ${decodingErrors}`);
}
exports.main = main;
function receiver(e) {
    if (e.message) {
        e.message.forEach(x => {
            if (!pancloud_nodejs_1.Util.dnsDecode(x)) {
                decodingErrors++;
            }
        });
        console.log(JSON.stringify(e, undefined, ' '));
    }
}
