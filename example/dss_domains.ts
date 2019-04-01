import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(c)
    let attr = await dss.domains()
    console.log("Sucessfully Received Domains")
    attr.forEach((v, i) => {
        console.log(`${i}: ${JSON.stringify(v)}`)
    })
}