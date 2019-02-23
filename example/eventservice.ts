import { isSdkError } from 'pancloud-nodejs'
import * as eventservice_ack from './eventservice_ack'
import * as eventservice_nack from './eventservice_nack'
import * as eventservice_flush from './eventservice_flush'
import * as eventservice_setfilter from './eventservice_setfilter'
import * as eventservice_getfilter from './eventservice_getfilter'
import * as eventservice_poll from './eventservice_poll'
import * as eventservice_async_poll from './eventservice_async_poll'
import * as eventservice_clearfilter from './eventservice_clearfilter'
import * as eventservice_pcap from './eventservice_async_pcap'
import * as eventservice_corr from './eventservice_correlation'

const examples: { [i: string]: () => Promise<void> } = {
    "ACK": eventservice_ack.main,
    "NACK": eventservice_nack.main,
    "FLUSH": eventservice_flush.main,
    "SET_FILTER": eventservice_setfilter.main,
    "GET_FILTER": eventservice_getfilter.main,
    "POLL": eventservice_poll.main,
    "ASYNC_POLL": eventservice_async_poll.main,
    "ASYNC_PCAP": eventservice_pcap.main,
    "L2CORRELATION": eventservice_corr.main,
    "CLEAR_FILTER": eventservice_clearfilter.main,
}

if (process.argv.length < 3 || !Object.keys(examples).includes(process.argv[2])) {
    console.log("Usage: 'node example/credential <example>' where example is one of the following keywords")
    Object.keys(examples).forEach(e => {
        console.log(`- ${e}`)
    })
    process.exit()
}

examples[process.argv[2]]().then().catch(e => {
    if (isSdkError(e)) {
        let aferr = e
        console.log(`Application Framework Error fields: code = ${aferr.getErrorCode()}, message = ${aferr.getErrorMessage()}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})