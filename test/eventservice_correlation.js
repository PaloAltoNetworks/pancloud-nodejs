"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let builderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 }
    ],
    filterOptions: {
        callBack: {
            corr: corrReceicer
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    }
};
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    await es.filterBuilder(builderCfg);
    console.log("Set the filter and registered the async event receiver");
    await new Promise(resolve => {
        setTimeout(() => {
            console.log('\n1 minute timer expired. Pausing the poller');
            es.pause();
            resolve();
        }, 120000);
    });
    await es.clearFilter(true);
    console.log("Cleared the filter and flushed the channel");
    console.log("Event Service stats");
    console.log(JSON.stringify(es.getEsStats(), undefined, " "));
}
exports.main = main;
let l2l3map = {
    l2dst: {}, l2src: {}
};
let corrEventCounter = 0;
function corrReceicer(e) {
    if (e.message) {
        corrEventCounter += e.message.length;
        console.log(`${corrEventCounter} correlation events received so far`);
        e.message.forEach(x => {
            if (x["extended-traffic-log-mac"] in l2l3map.l2src) {
                l2l3map.l2src[x["extended-traffic-log-mac"]][x.src] = true;
            }
            else {
                l2l3map.l2src[x["extended-traffic-log-mac"]] = { [x.src]: true };
            }
            if (x["extended-traffic-log-mac-stc"] in l2l3map.l2dst) {
                l2l3map.l2dst[x["extended-traffic-log-mac-stc"]][x.dst] = true;
            }
            else {
                l2l3map.l2dst[x["extended-traffic-log-mac-stc"]] = { [x.dst]: true };
            }
        });
    }
}
