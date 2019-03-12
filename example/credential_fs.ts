import { defaultCredentialsFactory } from 'pancloud-nodejs'

export async function main(): Promise<void> {
    let c = await defaultCredentialsFactory()
    let d = new Date(await c.getExpiration() * 1000)
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`)
}