import { Credentials } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

export async function main(): Promise<void> {
    let c = await Credentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        access_token: a_token,
        refresh_token: r_token
    })
    let d = new Date(c.get_expiration() * 1000)
    console.log(`Access Token: ${c.get_access_token()}\nValid until: ${d.toISOString()}`)
    console.log('... calling refresh token')
    await c.refresh_access_token()
    d = new Date(c.get_expiration() * 1000)
    console.log(`Access Token: ${c.get_access_token()}\nValid until: ${d.toISOString()}`)
}