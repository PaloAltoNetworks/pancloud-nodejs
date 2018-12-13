import { Credentials } from '../lib/credentials'
import { LoggingService, lsQuery, jobResult } from '../lib/loggingservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let job: jobResult
let ls: LoggingService
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
}

async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    ls = await LoggingService.factory(c, entryPoint, true)
    job = await ls.query(query)
    let seq = job.sequenceNo
    if (job.queryStatus == "FINISHED") {
        seq = job.sequenceNo + 1
    }
    let loopException: any
    while (job.queryStatus != "JOB_FINISHED" && !loopException) {
        console.log(`Successfully checked the query id: ${job.queryId} with status: ${job.queryStatus} and sequence: ${job.sequenceNo}`)
        if (job.result.esResult) {
            console.log(`   ... and contains ${job.result.esResult.hits.hits.length} records`)
        }
        try {
            job = await delayedPoll(seq, 1000)
        } catch (loopException) { }
        if (job.queryStatus == "FINISHED") {
            seq = job.sequenceNo + 1
        }
        if (job.queryStatus == "JOB_FAILED") {
            throw new Error("JOB Failed")
        }
    }
    try {
        await ls.delete_query(job.queryId)
    } catch (loopException) { }
    if (loopException) {
        throw loopException
    }
    console.log(`Successfully checked the query id: ${job.queryId} with status: ${job.queryStatus} and sequence: ${job.sequenceNo}`)
    if (job.result.esResult) {
        console.log(`   ... and contains ${job.result.esResult.hits.hits.length} records`)
    }
    console.log(`Job also has been deleted`)
}

main().then().catch(e => {
    if (e.name == APPFRERR) {
        let aferr = e as appFerr
        console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})

function delayedPoll(seq: number, delay: number): Promise<jobResult> {
    return new Promise<jobResult>((ready, notReady) => {
        setTimeout(async () => {
            try {
                job = await ls.poll(job.queryId, seq, 1000)
            } catch (e) {
                notReady(e)
            }
            ready(job)
        }, delay)
    })
}