import { EmbededCredentials, LoggingService, ENTRYPOINT, LsQuery, EmitterInterface, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: LsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000
}

let ls: LoggingService

/**
 * Use the loggingservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await EmbededCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    ls = await LoggingService.factory(entryPoint, {
        credential: c,
        fetchTimeout: 45000
        // level: LogLevel.DEBUG
    })
    try {
        let result = await ls.query(query, { event: receiver })
        console.log(`Job ${result.queryId} completed with status ${result.queryStatus}`)
    } catch (e) {
        console.log(`Something went wrong with a LS query ${e}`)
    }
    console.log("Logging Service stats")
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "))
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
    console.log("Let's assume something went wrong in the receiver and that we have to cancell the query")
    ls.cancelPoll(e.source)
}
