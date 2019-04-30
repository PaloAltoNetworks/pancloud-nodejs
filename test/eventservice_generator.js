"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
let builderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000, batchSize: 8000 },
        { table: "panw.dpi", timeout: 1000, batchSize: 8000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }
    ],
    flush: false,
    filterOptions: {}
};
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    await es.filterBuilder(builderCfg);
    let iterations = 10;
    for (let prom of es) {
        if (iterations-- == 0)
            break;
        let response = await prom;
        console.log(`Processed iteration ${iterations}`);
        response.forEach(e => {
            console.log(`${e.event.length} ${e.logType} events`);
        });
    }
    await es.clearFilter();
    console.log("Event Service stats");
    console.log(JSON.stringify(es.getEsStats(), undefined, " "));
}
exports.main = main;
