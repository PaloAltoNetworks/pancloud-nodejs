import { EmbeddedCredentials } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

export async function main(): Promise<void> {
    let c = await EmbeddedCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        accessToken: a_token,
        refreshToken: r_token
    })
    let d = new Date(c.getExpiration() * 1000)
    console.log(`Access Token: ${c.getAccessToken()}\nValid until: ${d.toISOString()}`)
    console.log('... calling refresh token')
    await c.refreshAccessToken()
    d = new Date(c.getExpiration() * 1000)
    console.log(`Access Token: ${c.getAccessToken()}\nValid until: ${d.toISOString()}`)
}