import { Credentials } from '../lib/credentials'
import { LoggingService, lsQuery } from '../lib/loggingservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)
let lType = ""

let query: lsQuery = {
    query: 'select * from panw.traffic limit 10',
    startTime: now - 36000,
    endTime: now,
    maxWaitTime: 20000
}

async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let ls = await LoggingService.factory(c, entryPoint, true)
    let job = await ls.query(query)
    console.log(`Successfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
    if (job.result.esResult) {
        console.log(`... containing ${job.result.esResult.hits.hits.length} events`)
    }
}

main().then().catch(e => {
    if (e.name == APPFRERR) {
        let aferr = e as appFerr
        console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})
