import { EmbeddedCredentials, EventService, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await EmbeddedCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    let es = await EventService.factory(entryPoint, {
        credential: c,
        level: LogLevel.DEBUG
    })
    await es.ack()
    console.log("Sucessfully ack'ed the channel")
}