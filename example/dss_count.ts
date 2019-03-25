import { autoCredentials, DirectorySyncService, LogLevel } from 'pancloud-nodejs'
import { DssObjClass } from 'pancloud-nodejs/lib/directorysyncservice';

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let dss = await DirectorySyncService.factory(c)
    console.log("Retrieving count per object classes")
    for (let i of ["computers", "containers", "groups", "users"]) {
        let count = await dss.count("panwdomain", i as DssObjClass)
        console.log(`${i}: ${count}`)
    }
}