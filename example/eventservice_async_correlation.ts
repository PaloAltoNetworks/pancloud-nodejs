import { Credentials, EventService, ENTRYPOINT, esFilterBuilderCfg, emitterInterface, logLevel, l2correlation } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 }],
    filterOptions: {
        CallBack: {
            corr: corrReceicer
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000,
            fetchTimeout: 45000
        }
    },
    flush: true
}

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await Credentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let es = await EventService.factory({
        credential: c,
        entryPoint: entryPoint,
        // level: logLevel.DEBUG,
        l2Corr: {
            timeWindow: 120,
            gcMultiplier: 100
        }
    })
    await es.filterBuilder(builderCfg)
    console.log("Set the filter and registered the async pcap receiver")
    await new Promise<void>(resolve => {
        setTimeout(() => {
            console.log('\n1 minute timer expired. Pausing the poller')
            es.pause()
            resolve()
        }, 60000)
    })
    await es.clearFilter(true)
    es.l2CorrFlush()
    console.log("Cleared the filter and flushed the channel")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
    console.log(JSON.stringify(l2l3map, undefined, "."))
}

let l2l3map: { l2src: { [l2: string]: { [v: string]: boolean } }, l2dst: { [l2: string]: { [v: string]: boolean } } } = {
    l2dst: {}, l2src: {}
}

let correlatedEvents = 0
function corrReceicer(e: emitterInterface<l2correlation[]>): void {
    correlatedEvents += (e.message) ? e.message.length : 0
    console.log(`${correlatedEvents} correlated events received so far`)
    if (e.message) {
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