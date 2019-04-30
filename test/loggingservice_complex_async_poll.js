"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let now = Math.floor(Date.now() / 1000);
let es;
let query1 = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        event: receiver
    }
};
let query2 = {
    query: 'select * from panw.threat limit 30000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {}
};
let builderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }
    ],
    filterOptions: {
        callBack: {
            event: receiver
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    }
};
/**
 * Use the loggingservice.js launcher to call this main() function
 */
async function main() {
    /*     let c = await EmbeddedCredentials.factory({
            clientId: c_id,
            clientSecret: c_secret,
            refreshToken: r_token,
            accessToken: a_token
        })
     */
    let c = await pancloud_nodejs_1.autoCredentials();
    es = await pancloud_nodejs_1.EventService.factory(c, { fetchTimeout: 45000 });
    await es.filterBuilder(builderCfg);
    console.log("Successfully started the Event Service notifier");
    let ls = await pancloud_nodejs_1.LoggingService.factory(c, { fetchTimeout: 45000 });
    let job1 = ls.query(query1); // Schedule query 1 and register the receiver
    let job2 = ls.query(query2); // Schedule query 2 with no additional registration
    try {
        let results = await Promise.all([job1, job2]);
        results.forEach(j => {
            console.log(`Job ${j.queryId} completed with status ${j.queryStatus}`);
        });
    }
    catch (e) {
        console.log(`Something went wrong with a LS query ${e}`);
    }
    es.pause();
    await es.clearFilter();
    console.log("Logging Service stats");
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "));
    console.log("Event Service stats");
    console.log(JSON.stringify(es.getEsStats(), undefined, " "));
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
