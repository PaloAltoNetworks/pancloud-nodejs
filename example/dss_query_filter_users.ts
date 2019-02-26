import { EmbeddedCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await EmbeddedCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    let dss = await DirectorySyncService.factory(entryPoint, {
        credential: c
        // level: LogLevel.DEBUG
    })
    let users = await dss.query('users', {
        domain: "panwdomain",
        filter: {
            level: 'immediate',
            type: 'group',
            name: {
                attributeName: 'Common-Name',
                attributeValue: 'Adm',
                matchCriteria: 'startWith'
            }
        }
    })
    console.log(`Sucessfully Received ${users.count} user objects`)
    users.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${users.pageNumber}`)
    console.log(`Page Size: ${users.pageSize}`)
    if (users.unreadResults) { console.log(`Unread Results: ${users.unreadResults}`) }
}