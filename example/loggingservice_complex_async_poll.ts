import { embededCredentials, EventService, esFilterBuilderCfg, LoggingService, ENTRYPOINT, lsQuery, emitterInterface, logLevel } from 'pancloud-nodejs'
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
    query: 'select * from panw.threat limit 30000',
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
        CallBack: {
            event: receiver
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000,
            fetchTimeout: 45000
        }
    }
}

/**
 * Use the loggingservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    es = await EventService.factory({
        credential: c,
        // level: logLevel.DEBUG,
        entryPoint: entryPoint
    })
    await es.filterBuilder(builderCfg)
    console.log("Successfully started the Event Service notifier")
    let ls = await LoggingService.factory({
        credential: c,
        // level: logLevel.DEBUG,
        entryPoint: entryPoint
    })
    let job1 = ls.query(query1, { event: receiver }, undefined, 45000) // Schedule query 1 and register the receiver
    let job2 = ls.query(query2, { event: receiver }, undefined, 45000) // Schedule query 2 with no additional registration
    try {
        let results = await Promise.all([job1, job2])
        results.forEach(j => {
            console.log(`Job ${j.queryId} completed with status ${j.queryStatus}`)
        })
    } catch (e) {
        console.log(`Something went wrong with a LS query ${e}`)
    }
    es.pause()
    await es.clearFilter()
    console.log("Logging Service stats")
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "))
    console.log("Event Service stats")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
}

let lQid = ""
let eventCounter = 0

function receiver(e: emitterInterface<any[]>): void {
    if (e.source != lQid) {
        lQid = e.source
        console.log(`\nReceiving: Event Type: ${e.logType} from ${e.source}`)
    }
    if (e.message) {
        eventCounter += e.message.length
        console.log(`${eventCounter} events received so far`)
    }
}
