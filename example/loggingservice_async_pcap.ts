import { Credentials, LoggingService, ENTRYPOINT, lsQuery, emitterInterface, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'
import { writeFileSync } from 'fs'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: 'select * from panw.threat limit 40',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000
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
        // level: logLevel.DEBUG,
        entryPoint: entryPoint
    })
    await ls.query(query, { pcap: receiver }, undefined, 45000) // Schedule query 1 and register the receiver
}

let pcapCounter = 0

function receiver(e: emitterInterface<Buffer>): void {
    if (e.message) {
        writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message)
        console.log(`Received PCAP body of ${e.message.length} bytes`)
    }
}
