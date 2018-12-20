import { Credentials } from 'pancloud-nodejs'
import { c_id, c_secret, r_token } from './secrets'

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, undefined, r_token)
    let d = new Date(c.get_expiration() * 1000)
    console.log(`Access Token: ${c.get_access_token()}\nValid until: ${d.toISOString()}`)
}