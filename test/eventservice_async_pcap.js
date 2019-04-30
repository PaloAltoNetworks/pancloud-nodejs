"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const fs_1 = require("fs");
let builderCfg = {
    filter: [
        { table: "panw.threat", timeout: 1000 }
    ],
    filterOptions: {
        callBack: {
            pcap: receiver
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    },
    flush: true
};
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    await es.filterBuilder(builderCfg);
    console.log("Set the filter and registered the async pcap receiver");
    await new Promise(resolve => {
        setTimeout(() => {
            console.log('\n1 minute timer expired. Pausing the poller');
            es.pause();
            resolve();
        }, 60000);
    });
    await es.clearFilter(true);
    console.log("Cleared the filter and flushed the channel");
    console.log("Event Service stats");
    console.log(JSON.stringify(es.getEsStats(), undefined, " "));
}
exports.main = main;
let pcapCounter = 0;
function receiver(e) {
    if (e.message) {
        fs_1.writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message);
        console.log(`Received PCAP body of ${e.message.length} bytes`);
    }
    else {
        console.log(`Received null event from ${e.source}. Ending process`);
    }
}
