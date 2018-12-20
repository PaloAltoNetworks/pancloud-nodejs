import { Credentials, EventService, ENTRYPOINT, esFilterBuilderCfg, emittedEvent } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000 },
        { table: "panw.dpi", timeout: 1000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    filterOptions: {
        eventCallBack: receiver,
        poolOptions: {
            ack: true,
            pollTimeout: 1000,
            fetchTimeout: 45000
        }
    }
}

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let es = await EventService.factory(c, entryPoint, true)
    await es.filterBuilder(builderCfg)
    console.log("Set the filter and registered the async event receiver")
    await new Promise<void>(resolve => {
        setTimeout(() => {
            console.log('\n1 minute timer expired. Pausing the poller')
            es.pause()
            resolve()
        }, 60000)
    })
    await es.clearFilter(true)
    console.log("Cleared the filter and flushed the channel")
}

let lType = ""
let eventCounter = 0

function receiver(e: emittedEvent): void {
    if (e.logType && e.logType != lType) {
        lType = e.logType
        console.log(`\nReceiving: Event Type: ${lType} from ${e.source}`)
    }
    if (e.event) {
        eventCounter += e.event.length
    }
    process.stdout.write(`${eventCounter}...`)
}