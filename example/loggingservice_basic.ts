import { EmbeddedCredentials, LoggingService, LsQueryCfg, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: LsQueryCfg = {
    query: 'select * from panw.traffic limit 10',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 20000
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
    let ls = await LoggingService.factory(entryPoint, {
        credential: c,
        // level: LogLevel.DEBUG
    })
    let job = await ls.query(query)
    console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
    if (job.result.esResult) {
        console.log(`... containing ${job.result.esResult.hits.hits.length} events`)
    }
}
