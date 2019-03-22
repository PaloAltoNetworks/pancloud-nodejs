import { fsCredentialsFactory } from 'pancloud-nodejs'
import { env } from 'process'

export async function main(): Promise<void> {
    let refreshToken = env['PAN_REFRESH_TOKEN']
    if (!refreshToken) {
        throw new Error('Provide a valid refresh token in the PAN_REFRESH_TOKEN environment variable')
    }
    let credProv = await fsCredentialsFactory({ secret: 'mysecret' })
    let c = await credProv.registerManualDatalake('hello', refreshToken)
    let d = new Date(await c.getExpiration() * 1000)
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`)
    let parm = credProv.paramsParser('aW5zdGFuY2VfaWQ9ODIxMDI4NTA5ODkyNzg2NzA3Jmluc3RhbmNlX25hbWU9RXVyb3BlXzE3NiZyZWdpb249ZXVyb3BlJmxzbj0wMTc5MDAwNDE3NiZsc2FsaWFzPXhob21zXzE3Ng==')
    console.log(JSON.stringify(parm, undefined, ' '))
    let authUrl = await credProv.idpAuthRequest('localhost:8080',
        ['logging-service:read', 'event-service:read', 'directory-sync-service:read'],
        'hello', parm)
    console.log(authUrl)
}