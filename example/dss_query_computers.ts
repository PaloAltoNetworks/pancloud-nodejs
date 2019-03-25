import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(c)
    let computers = await dss.query('computers')
    console.log(`Sucessfully Received ${computers.count} computer objects`)
    computers.result.forEach(x => {
        console.log(`Domain: ${x.domainName}\n---`)
        console.log(JSON.stringify(x, undefined, ' '))
    })
    console.log(`Page Number: ${computers.pageNumber}`)
    console.log(`Page Size: ${computers.pageSize}`)
    if (computers.unreadResults) { console.log(`Unread Results: ${computers.unreadResults}`) }
}