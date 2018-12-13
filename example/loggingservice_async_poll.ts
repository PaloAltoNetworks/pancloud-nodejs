import { Credentials } from '../lib/credentials'
import { LoggingService, emittedEvent, lsQuery, jobResult } from '../lib/loggingservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query1: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
}

let query2: lsQuery = {
    query: 'select * from panw.traffic limit 30000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
}

async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let ls = await LoggingService.factory(c, entryPoint, true)
    await new Promise(async (resolve, reject) => {
        finishFunc = resolve
        try {
            job = await ls.query(query1, receiver) // Schedule query 1 and register the receiver
            jobsRunning++
            console.log(`\nSuccessfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
            job = await ls.query(query2, null) // Schedule query 2 with no additional registration
            jobsRunning++
            console.log(`\nSuccessfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
        } catch (e) {
            reject(e)
        }
    })
}

function receiver(e: emittedEvent): void {
    if (!(e.event)) {
        console.log(`\nReceived Empty Event (final) from ${e.source}`)
        if (jobsRunning-- <= 0) {
            finishFunc()
        }
        return
    }
    if (e.source != lQid) {
        lQid = e.source
        console.log(`\nReceiving: Event Type: ${e.logType} from ${e.source}`)
    }
    eventCounter++
    if (eventCounter % 100 == 0) {
        if (eventCounter % 1000 == 0) {
            process.stdout.write(`${eventCounter}`)
        }
        process.stdout.write(".")
    }
}

let job: jobResult = { queryId: "", queryStatus: "JOB_FINISHED", result: { esResult: null }, sequenceNo: 0 }
let lQid = ""
let eventCounter = 0
let jobsRunning = 0
let finishFunc: () => void

main().then().catch(e => {
    if (e.name == APPFRERR) {
        let aferr = e as appFerr
        console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})
