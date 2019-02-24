import { embededCredentials } from 'pancloud-nodejs'
import { c_id, c_secret, r_token } from './secrets'

export async function main(): Promise<void> {
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token
    })
    let d = new Date(c.get_expiration() * 1000)
    console.log(`Access Token: ${c.get_access_token()}\nValid until: ${d.toISOString()}`)
}