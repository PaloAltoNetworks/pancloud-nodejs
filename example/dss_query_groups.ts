import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
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