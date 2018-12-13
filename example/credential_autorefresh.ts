import { Credentials } from '../lib/credentials'
import { c_id, c_secret, r_token } from './secrets'

async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, undefined, r_token)
    let d = new Date(c.get_expiration() * 1000)
    console.log(`Access Token: ${c.get_access_token()}\nValid until: ${d.toISOString()}`)
}

main().then().catch(e => {
    console.log(`General Error\n${e.stack}`)
})
