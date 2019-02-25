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
        // level: logLevel.DEBUG
    })
    let groups = await dss.query('groups')
    console.log(`Sucessfully Received ${groups.count} group objects`)
    groups.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${groups.pageNumber}`)
    console.log(`Page Size: ${groups.pageSize}`)
    if (groups.unreadResults) { console.log(`Unread Results: ${groups.unreadResults}`) }
}