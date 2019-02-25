import { EmbededCredentials, LoggingService, ENTRYPOINT, LsQuery, EmitterInterface, LogLevel, Util } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)

let query: LsQuery = {
    query: "select * from panw.dpi where subtype='dns' limit 40",
    startTime: now - 3600,
    endTime: now,
    maxWaitTime: 1000
}

let decodingErrors = 0
/**
 * Use the loggingservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await EmbededCredentials.factory({
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
    await ls.query(query, { event: receiver }) // Schedule query 1 and register the receiver
    console.log("Logging Service stats")
    console.log(JSON.stringify(ls.getLsStats(), undefined, " "))
    console.log(`DNS Decoding Errorr: ${decodingErrors}`)
}

function receiver(e: EmitterInterface<any[]>): void {
    if (e.message) {
        e.message.forEach(x => {
            if (!Util.dnsDecode(x)) {
                decodingErrors++
            }
        })
        console.log(JSON.stringify(e, undefined, ' '))
    }
}
