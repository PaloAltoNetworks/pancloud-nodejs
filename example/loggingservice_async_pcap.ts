import { EmbeddedCredentials, LoggingService, LsQueryCfg, EmitterInterface, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'
import { writeFileSync } from 'fs'

const entryPoint = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: LsQueryCfg = {
    query: 'select * from panw.threat limit 40',
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000,
    callBack: {
        pcap: receiver
    }
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
        fetchTimeout: 45000
        // level: LogLevel.DEBUG
    })
    await ls.query(query) // Schedule query 1 and register the receiver
    console.log("Logging Service stats")
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "))
}

let pcapCounter = 0

function receiver(e: EmitterInterface<Buffer>): void {
    if (e.message) {
        writeFileSync("pcap" + ("00" + pcapCounter++).substr(-3) + ".pcap", e.message)
        console.log(`Received PCAP body of ${e.message.length} bytes`)
    }
}
