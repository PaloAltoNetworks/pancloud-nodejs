"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let now = Math.floor(Date.now() / 1000);
let query = {
    query: 'select * from panw.traffic limit 10',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 20000
};
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, { fetchTimeout: 45000 });
    let job = await ls.query(query);
    console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`);
    if (job.result.esResult) {
        console.log(`... containing ${job.result.esResult.hits.hits.length} events`);
    }
}
exports.main = main;
