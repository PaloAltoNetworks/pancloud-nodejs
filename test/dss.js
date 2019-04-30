"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const dss_attributes = require("./dss_attributes");
const dss_domains = require("./dss_domains");
const dss_count = require("./dss_count");
const dss_query_users = require("./dss_query_users");
const dss_query_computers = require("./dss_query_computers");
const dss_query_ous = require("./dss_query_ous");
const dss_query_groups = require("./dss_query_groups");
const dss_query_containers = require("./dss_query_containers");
const dss_query_sublist_users = require("./dss_query_sublist_users");
const dss_query_filter_users = require("./dss_query_filter_users");
const examples = {
    "ATTR": dss_attributes.main,
    "DOMAINS": dss_domains.main,
    "COUNT": dss_count.main,
    "QUERY_USERS": dss_query_users.main,
    "QUERY_COMPUTERS": dss_query_computers.main,
    "QUERY_OUS": dss_query_ous.main,
    "QUERY_GROUPS": dss_query_groups.main,
    "QUERY_CONTAINERS": dss_query_containers.main,
    "QUERY_SUBLIST_USERS": dss_query_sublist_users.main,
    "QUERY_FILTER_USERS": dss_query_filter_users.main
};
if (process.argv.length < 3 || !Object.keys(examples).includes(process.argv[2])) {
    console.log("Usage: 'node example/dss <example>' where example is one of the following keywords");
    Object.keys(examples).forEach(e => {
        console.log(`- ${e}`);
    });
    process.exit();
}
examples[process.argv[2]]().then().catch(e => {
    if (pancloud_nodejs_1.isSdkError(e)) {
        let aferr = e;
        console.log(`Application Framework Error fields: code = ${aferr.getErrorCode()}, message = ${aferr.getErrorMessage()}`);
    }
    else {
        console.log(`General Error\n${e.stack}`);
    }
});
