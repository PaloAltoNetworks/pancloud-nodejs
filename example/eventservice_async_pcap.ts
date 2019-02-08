import { embededCredentials, EventService, ENTRYPOINT, esFilterBuilderCfg, emitterInterface, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'
import { writeFileSync } from 'fs'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.threat", timeout: 1000 }],
    filterOptions: {
        CallBack: {
            pcap: receiver
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
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let es = await EventService.factory({
        credential: c,
        // level: logLevel.DEBUG,
        entryPoint: entryPoint
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
    console.log("Cleared the filter and flushed the channel")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
}

let pcapCounter = 0

function receiver(e: emitterInterface<Buffer>): void {
    if (e.message) {
        writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message)
        console.log(`Received PCAP body of ${e.message.length} bytes`)
    } else {
        console.log(`Received null event from ${e.source}. Ending process`)
    }
}
