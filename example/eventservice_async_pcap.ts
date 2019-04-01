import { autoCredentials, EventService, EsFilterBuilderCfg, EmitterInterface, LogLevel } from 'pancloud-nodejs'
import { writeFileSync } from 'fs'

let builderCfg: EsFilterBuilderCfg = {
    filter: [
        { table: "panw.threat", timeout: 1000 }],
    filterOptions: {
        callBack: {
            pcap: receiver
        },
        poolOptions: {
            ack: true,
            pollTimeout: 1000
        }
    },
    flush: true
}

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await autoCredentials()
    let es = await EventService.factory(c)
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
    console.log("Event Service stats")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
}

let pcapCounter = 0

function receiver(e: EmitterInterface<Buffer>): void {
    if (e.message) {
        writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message)
        console.log(`Received PCAP body of ${e.message.length} bytes`)
    } else {
        console.log(`Received null event from ${e.source}. Ending process`)
    }
}
