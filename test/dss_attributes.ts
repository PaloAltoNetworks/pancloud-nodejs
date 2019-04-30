import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(c)
    let attr = await dss.attributes()
    console.log("Sucessfully Received Attributes")
    console.log(JSON.stringify(attr, undefined, ' '))
}