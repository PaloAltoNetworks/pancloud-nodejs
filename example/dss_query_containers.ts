import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(c)
    let containers = await dss.query('containers')
    console.log(`Sucessfully Received ${containers.count} container objects`)
    containers.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${containers.pageNumber}`)
    console.log(`Page Size: ${containers.pageSize}`)
    if (containers.unreadResults) { console.log(`Unread Results: ${containers.unreadResults}`) }
}