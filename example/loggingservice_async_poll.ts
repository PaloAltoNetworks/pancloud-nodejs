import { embededCredentials, LoggingService, ENTRYPOINT, lsQuery, emitterInterface, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.traffic limit 4',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000
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
    let ls = await LoggingService.factory({
        credential: c,
        // level: logLevel.DEBUG,
        entryPoint: entryPoint
    })
    try {
        let result = await ls.query(query, { event: receiver }, undefined, 45000)
        console.log(`Job ${result.queryId} completed with status ${result.queryStatus}`)
    } catch (e) {
        console.log(`Something went wrong with a LS query ${e}`)
    }
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
