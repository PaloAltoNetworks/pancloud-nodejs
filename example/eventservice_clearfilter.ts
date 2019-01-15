import { Credentials, EventService, ENTRYPOINT, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await Credentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let es = await EventService.factory({
        credential: c,
        entryPoint: entryPoint,
        level: logLevel.DEBUG
    })
    await es.clearFilter()
    console.log('Successfully cleared the filter')
}
