"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let ls;
let now = Math.floor(Date.now() / 1000);
let query = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
};
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, {
        fetchTimeout: 45000, controlListener: x => {
            console.log('Received control message\n', JSON.stringify(x, undefined, ' '));
        }
    });
    let job = await ls.query(query);
    let seq = job.sequenceNo;
    if (job.queryStatus == "FINISHED") {
        seq = job.sequenceNo + 1;
    }
    let loopException;
    while (job.queryStatus != "JOB_FINISHED" && !loopException) {
        console.log(`Successfully checked the query id: ${job.queryId} with status: ${job.queryStatus} and sequence: ${job.sequenceNo}`);
        if (job.result.esResult) {
            console.log(`   ... and contains ${job.result.esResult.hits.hits.length} records`);
        }
        try {
            job = await delayedFunc(1000, ls.poll.bind(ls), job.queryId, seq);
        }
        catch (loopException) { }
        if (job.queryStatus == "FINISHED") {
            seq = job.sequenceNo + 1;
        }
        if (job.queryStatus == "JOB_FAILED") {
            throw new Error("JOB Failed");
        }
    }
    try {
        await ls.deleteQuery(job.queryId);
    }
    catch (loopException) { }
    if (loopException) {
        throw loopException;
    }
    console.log(`Successfully checked the query id: ${job.queryId} with status: ${job.queryStatus} and sequence: ${job.sequenceNo}`);
    if (job.result.esResult) {
        console.log(`   ... and contains ${job.result.esResult.hits.hits.length} records`);
    }
    console.log(`Job also has been deleted`);
}
exports.main = main;
function delayedFunc(delay, f, ...args) {
    return new Promise((ready, notReady) => {
        let task = f(...args);
        setTimeout(async () => {
            try {
                ready(await task);
            }
            catch (e) {
                notReady(e);
            }
        }, delay);
    });
}
