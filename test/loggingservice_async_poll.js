"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let now = Math.floor(Date.now() / 1000);
let query = {
    query: 'select * from panw.traffic limit 4',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        event: receiver
    }
};
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, { fetchTimeout: 45000 });
    try {
        let result = await ls.query(query);
        console.log(`Job ${result.queryId} completed with status ${result.queryStatus}`);
    }
    catch (e) {
        console.log(`Something went wrong with a LS query ${e}`);
    }
    console.log("Logging Service stats");
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "));
}
exports.main = main;
let lQid = "";
let eventCounter = 0;
function receiver(e) {
    if (e.source != lQid) {
        lQid = e.source;
        console.log(`\nReceiving: Event Type: ${e.logType} from ${e.source}`);
    }
    if (e.message) {
        eventCounter += e.message.length;
        console.log(`${eventCounter} events received so far`);
    }
}
