"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const loggingservice_basic = require("./loggingservice_basic");
const loggingservice_poll = require("./loggingservice_poll");
const loggingservice_async_poll = require("./loggingservice_async_poll");
const loggingservice_complex_async_poll = require("./loggingservice_complex_async_poll");
const loggingservice_async_pcap = require("./loggingservice_async_pcap");
const loggingservice_async_dns_poll = require("./loggingservice_async_dns_poll");
const loggingservice_cancel_async_poll = require("./loggingservice_cancel_async_poll");
const examples = {
    "BASIC": loggingservice_basic.main,
    "POLL": loggingservice_poll.main,
    "ASYNC_POLL": loggingservice_async_poll.main,
    "ASYNC_CANCEL": loggingservice_cancel_async_poll.main,
    "ASYNC_DNS_POLL": loggingservice_async_dns_poll.main,
    "ASYNC_PCAP": loggingservice_async_pcap.main,
    "COMPLEX_ASYNC_POLL": loggingservice_complex_async_poll.main
};
if (process.argv.length < 3 || !Object.keys(examples).includes(process.argv[2])) {
    console.log("Usage: 'node example/credential <example>' where example is one of the following keywords");
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
