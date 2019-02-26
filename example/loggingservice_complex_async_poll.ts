import { EmbeddedCredentials, EventService, EsFilterBuilderCfg, LoggingService, LsQueryCfg, EmitterInterface, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)
let es: EventService

let query1: LsQueryCfg = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        event: receiver
    }
}

let query2: LsQueryCfg = {
    query: 'select * from panw.threat limit 30000',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {}
}

let builderCfg: EsFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    filterOptions: {
        callBack: {
            event: receiver
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    }
}

/**
 * Use the loggingservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await EmbeddedCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    es = await EventService.factory(entryPoint, {
        credential: c,
        fetchTimeout: 45000
        // level: LogLevel.DEBUG
    })
    await es.filterBuilder(builderCfg)
    console.log("Successfully started the Event Service notifier")
    let ls = await LoggingService.factory(entryPoint, {
        credential: c,
        fetchTimeout: 45000
        // level: LogLevel.DEBUG
    })
    let job1 = ls.query(query1) // Schedule query 1 and register the receiver
    let job2 = ls.query(query2) // Schedule query 2 with no additional registration
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

function receiver(e: EmitterInterface<any[]>): void {
    if (e.source != lQid) {
        lQid = e.source
        console.log(`\nReceiving: Event Type: ${e.logType} from ${e.source}`)
    }
    if (e.message) {
        eventCounter += e.message.length
        console.log(`${eventCounter} events received so far`)
    }
}
