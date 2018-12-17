import { Credentials, LoggingService, ENTRYPOINT, lsQuery } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.traffic limit 10',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 20000
}

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let ls = await LoggingService.factory(c, entryPoint, true)
    let job = await ls.query(query)
    console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
    if (job.result.esResult) {
        console.log(`... containing ${job.result.esResult.hits.hits.length} events`)
    }
}
