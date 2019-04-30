"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pancloud_nodejs_1 = require("pancloud-nodejs");
const eventservice_ack = require("./eventservice_ack");
const eventservice_nack = require("./eventservice_nack");
const eventservice_flush = require("./eventservice_flush");
const eventservice_setfilter = require("./eventservice_setfilter");
const eventservice_getfilter = require("./eventservice_getfilter");
const eventservice_poll = require("./eventservice_poll");
const eventservice_generator = require("./eventservice_generator");
const eventservice_async_poll = require("./eventservice_async_poll");
const eventservice_clearfilter = require("./eventservice_clearfilter");
const eventservice_pcap = require("./eventservice_async_pcap");
const eventservice_corr = require("./eventservice_correlation");
const examples = {
    "ACK": eventservice_ack.main,
    "NACK": eventservice_nack.main,
    "FLUSH": eventservice_flush.main,
    "SET_FILTER": eventservice_setfilter.main,
    "GET_FILTER": eventservice_getfilter.main,
    "POLL": eventservice_poll.main,
    "GENERATOR_POLL": eventservice_generator.main,
    "ASYNC_POLL": eventservice_async_poll.main,
    "ASYNC_PCAP": eventservice_pcap.main,
    "L2CORRELATION": eventservice_corr.main,
    "CLEAR_FILTER": eventservice_clearfilter.main,
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
