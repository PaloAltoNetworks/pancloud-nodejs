import { embededCredentials, DirectorySyncService, ENTRYPOINT, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let dss = await DirectorySyncService.factory(entryPoint, {
        credential: c
        // level: logLevel.DEBUG
    })
    let users = await dss.query('users')
    console.log(`Sucessfully Received ${users.count} user objects`)
    users.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${users.pageNumber}`)
    console.log(`Page Size: ${users.pageSize}`)
    if (users.unreadResults) { console.log(`Unread Results: ${users.unreadResults}`) }
}