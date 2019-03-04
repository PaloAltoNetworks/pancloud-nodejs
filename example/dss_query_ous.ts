import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(entryPoint, {
        credential: c
        // level: LogLevel.DEBUG
    })
    let ous = await dss.query('ous')
    console.log(`Sucessfully Received ${ous.count} ou objects`)
    ous.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${ous.pageNumber}`)
    console.log(`Page Size: ${ous.pageSize}`)
    if (ous.unreadResults) { console.log(`Unread Results: ${ous.unreadResults}`) }
}