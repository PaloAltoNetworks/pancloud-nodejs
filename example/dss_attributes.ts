import { EmbededCredentials, DirectorySyncService, ENTRYPOINT, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await EmbededCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    let dss = await DirectorySyncService.factory(entryPoint, {
        credential: c
        // level: LogLevel.DEBUG
    })
    let attr = await dss.attributes()
    console.log("Sucessfully Received Attributes")
    console.log(JSON.stringify(attr, undefined, ' '))
}