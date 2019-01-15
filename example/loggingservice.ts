import { isSdkError } from 'pancloud-nodejs'
import * as loggingservice_basic from './loggingservice_basic'
import * as loggingservice_poll from './loggingservice_poll'
import * as loggingservice_async_poll from './loggingservice_async_poll'
import * as loggingservice_complex_async_poll from './loggingservice_complex_async_poll'
import * as loggingservice_async_cancel_poll from './loggingservice_async_cancel_poll'

const examples: { [i: string]: () => Promise<void> } = {
    "BASIC": loggingservice_basic.main,
    "POLL": loggingservice_poll.main,
    "ASYNC_POLL": loggingservice_async_poll.main,
    "COMPLEX_ASYNC_POLL": loggingservice_complex_async_poll.main,
    "ASYNC_CANCEL_POLL": loggingservice_async_cancel_poll.main
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