import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(entryPoint, {
        credential: c
        // level: LogLevel.DEBUG
    })
    let attr = await dss.attributes()
    console.log("Sucessfully Received Attributes")
    console.log(JSON.stringify(attr, undefined, ' '))
}