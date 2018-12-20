import { Credentials, LoggingService, ENTRYPOINT, lsQuery } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let ls: LoggingService
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
}

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    ls = await LoggingService.factory(c, entryPoint, true)
    let job = await ls.query(query)
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
            job = await delayedFunc(1000, ls.poll.bind(ls), job.queryId, seq)
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

function delayedFunc<T>(delay: number, f: (...args: any[]) => Promise<T>, ...args: any[]): Promise<T> {
    return new Promise<T>((ready, notReady) => {
        let task = f(...args)
        setTimeout(async () => {
            try {
                ready(await task)
            } catch (e) {
                notReady(e)
            }
        }, delay)
    })
}