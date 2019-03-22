import { defaultCredentialsFactory } from 'pancloud-nodejs'
import { env } from 'process'

export async function main(): Promise<void> {
    let accessToken = env['PAN_ACCESS_TOKEN']
    if (!accessToken) {
        throw new Error(`environmental variable PAN_ACCESS_TOKEN does not exist is null`)
    }
    let c = await defaultCredentialsFactory(accessToken)
    let d = new Date(await c.getExpiration() * 1000)
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`)
}