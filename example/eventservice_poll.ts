import { EmbeddedCredentials, EventService, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await EmbeddedCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    let es = await EventService.factory(entryPoint, {
        credential: c,
        // level: LogLevel.DEBUG
    })
    let t = await es.poll()
    t.forEach(e => {
        console.log(`Event Type: ${e.logType}, Record Count: ${e.event.length}`)
        console.log(`First Event\n${JSON.stringify(e.event[0])}`)
    })
}
