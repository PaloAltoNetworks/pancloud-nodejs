import { Credentials, LoggingService, ENTRYPOINT, lsQuery, emittedEvent, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
}

let jobsRunning = 0
let finishFunc: () => void

export async function main(): Promise<void> {
    let c = await Credentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let ls = await LoggingService.factory({
        credential: c,
        entryPoint: entryPoint,
        level: logLevel.DEBUG
    })
    new Promise(async (resolve, reject) => {
        finishFunc = resolve
        try {
            let job = await ls.query(query, receiver, undefined, 45000) // Schedule query 1 and register the receiver
            jobsRunning++
            console.log(`\nSuccessfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
            new Promise(resolve => {
                setTimeout(async () => {
                    console.log("\nCancelling the query")
                    await ls.cancelPoll(job.queryId)
                    setTimeout(resolve, 1000)
                }, 10000)
            })
        } catch (e) {
            reject(e)
        }
    })
}

let lQid = ""
let eventCounter = 0

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
    eventCounter += e.event.length
    process.stdout.write(`${eventCounter}...`)
}
