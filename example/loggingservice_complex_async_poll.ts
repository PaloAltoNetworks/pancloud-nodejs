import { Credentials, EventService, esFilterBuilderCfg, LoggingService, ENTRYPOINT, lsQuery, emittedEvent } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)
let es: EventService

let query1: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
}

let query2: lsQuery = {
    query: 'select * from panw.traffic limit 30000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000
}

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    filterOptions: {
        eventCallBack: receiver,
        poolOptions: {
            ack: true,
            pollTimeout: 1000,
            fetchTimeout: 45000
        }
    }
}

let finishFunc: () => void
let jobsRunning = 0

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    es = await EventService.factory(c, entryPoint, true)
    await es.filterBuilder(builderCfg)
    console.log("Successfully started the Event Service notifier")
    let ls = await LoggingService.factory(c, entryPoint, true)
    await new Promise(async (resolve, reject) => {
        finishFunc = resolve
        try {
            jobsRunning = 2
            let job = await ls.query(query1, receiver, undefined, 45000) // Schedule query 1 and register the receiver
            console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
            job = await ls.query(query2, receiver, undefined, 45000) // Schedule query 2 with no additional registration
            console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
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
        jobsRunning--
        if (jobsRunning == 0) {
            new Promise(async (resolve, reject) => {
                try {
                    await es.pause()
                    console.log("Paused the Event Service notifier")
                    await es.clearFilter(true)
                    console.log("Cleared the Event Service filter and flushed the channel")
                } catch (e) {
                    reject(e)
                }
                resolve()
            }).then(() => {
                finishFunc()
            })
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
