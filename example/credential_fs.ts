import { fsCredentialsFactory } from 'pancloud-nodejs'
import { env } from 'process'

export async function main(): Promise<void> {
    let refreshToken = env['PAN_REFRESH_TOKEN']
    if (!refreshToken) {
        throw new Error('Provide a valid refresh token in the PAN_REFRESH_TOKEN environment variable')
    }
    let credProv = await fsCredentialsFactory({ secret: 'mysecret' })
    let c = await credProv.registerManualDatalake('hello', 'https://api.us.paloaltonetworks.com', refreshToken)
    let d = new Date(await c.getExpiration() * 1000)
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`)
}