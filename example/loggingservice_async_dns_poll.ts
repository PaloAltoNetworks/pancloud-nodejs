import { embededCredentials, LoggingService, ENTRYPOINT, lsQuery, emitterInterface, logLevel, util } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: lsQuery = {
    query: "select * from panw.dpi where subtype='dns' limit 4",
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000
}

/**
 * Use the loggingservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await embededCredentials.factory({
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
    await ls.query(query, { event: receiver }, undefined, 45000) // Schedule query 1 and register the receiver
}

function receiver(e: emitterInterface<any[]>): void {
    if (e.message) {
        e.message.forEach(x => { util.dnsDecode(x) })
        console.log(JSON.stringify(e, undefined, ' '))
    }
}
