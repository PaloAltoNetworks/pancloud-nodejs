"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
/**
 * Use the enventservice.js launcher to call this main() function
 */
async function main() {
    let c = await pancloud_nodejs_1.autoCredentials();
    let es = await pancloud_nodejs_1.EventService.factory(c);
    let f = await es.getFilters();
    console.log(`Current Filter Entries (flush: ${f.flush})`);
    f.filters.forEach(o => {
        Object.entries(o).forEach(e => {
            console.log(`- Table: ${e[0]} - filter: ${e[1].filter} / batchSize: ${e[1].batchSize} / timeout: ${e[1].timeout}`);
        });
    });
}
exports.main = main;
