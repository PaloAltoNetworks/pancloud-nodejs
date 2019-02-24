import { embededCredentials, DirectorySyncService, DSSObjClass, ENTRYPOINT, logLevel } from 'pancloud-nodejs'
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
    let objClass: DSSObjClass[] = ["computers", "containers", "groups", "users"]
    console.log("Retrieving count per object classes")
    for (let i = 0; i < objClass.length; i++) {
        let count = await dss.count("panwdomain", objClass[i])
        console.log(`${objClass[i]}: ${count}`)
    }
}