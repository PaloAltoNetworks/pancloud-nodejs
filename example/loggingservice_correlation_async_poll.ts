import { Credentials, LoggingService, ENTRYPOINT, lsQuery, emitterInterface, l2correlation } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query1: lsQuery = {
    query: 'select * from panw.traffic limit 40000',
    startTime: now - 2400,
    endTime: now,
    maxWaitTime: 0
}

let query2: lsQuery = {
    query: "select * from panw.dpi where subtype.keyword = 'extended-traffic-log' limit 40000",
    startTime: now - 2400,
    endTime: now,
    maxWaitTime: 0
}

/**
 * Use the loggingservice.js launcher to call this main() function
 */
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
        // level: logLevel.DEBUG,
        l2Corr: { timeWindow: 120, gcMultiplier: 100 }
    })
    let job1 = ls.query(query1, { corr: corrReceicer }, undefined, 45000)
    let job2 = ls.query(query2, { corr: corrReceicer }, undefined, 45000)
    try {
        let results = await Promise.all([job1, job2])
        results.forEach(j => {
            console.log(`Job ${j.queryId} completed with status ${j.queryStatus}`)
        })
    } catch (e) {
        console.log(`Something went wrong ${e}`)
    }
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "))
    console.log(JSON.stringify(l2l3map, undefined, "."))
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

let l2l3map: { l2src: { [l2: string]: { [v: string]: boolean } }, l2dst: { [l2: string]: { [v: string]: boolean } } } = {
    l2dst: {}, l2src: {}
}

let corrEventCounter = 0

function corrReceicer(e: emitterInterface<l2correlation[]>): void {
    if (e.message) {
        corrEventCounter += e.message.length
        console.log(`${corrEventCounter} correlation events received so far`)
        e.message.forEach(x => {
            if (x["extended-traffic-log-mac"] in l2l3map.l2src) {
                l2l3map.l2src[x["extended-traffic-log-mac"]][x.src] = true
            } else {
                l2l3map.l2src[x["extended-traffic-log-mac"]] = { [x.src]: true }
            }
            if (x["extended-traffic-log-mac-stc"] in l2l3map.l2dst) {
                l2l3map.l2dst[x["extended-traffic-log-mac-stc"]][x.dst] = true
            } else {
                l2l3map.l2dst[x["extended-traffic-log-mac-stc"]] = { [x.dst]: true }
            }
        })
    }
}   