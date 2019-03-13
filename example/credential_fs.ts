import { fsCredentialsFactory } from 'pancloud-nodejs'

export async function main(): Promise<void> {
    let credProv = await fsCredentialsFactory({ secret: 'mysecret' })
    let c = await credProv.registerManualDatalake('hello', 'fJv1DfHQsp3jpISTg6T0e5xyOWtLCaNdWnHyMBlWGl')
    let d = new Date(await c.getExpiration() * 1000)
    console.log(`Access Token: ${await c.getAccessToken()}\nValid until: ${d.toISOString()}`)
}