import { embededCredentials, EventService, ENTRYPOINT, emitterInterface, l2correlation, esFilterBuilderCfg } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 }],
    filterOptions: {
        callBack: {
            corr: corrReceicer
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    }
}

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let es = await EventService.factory(entryPoint, {
        credential: c,
        fetchTimeout: 45000
        // level: logLevel.DEBUG
    })
    await es.filterBuilder(builderCfg)
    console.log("Set the filter and registered the async event receiver")
    await new Promise<void>(resolve => {
        setTimeout(() => {
            console.log('\n1 minute timer expired. Pausing the poller')
            es.pause()
            resolve()
        }, 120000)
    })
    await es.clearFilter(true)
    console.log("Cleared the filter and flushed the channel")
    console.log("Event Service stats")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
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