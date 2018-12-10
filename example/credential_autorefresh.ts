import { Credentials } from '../lib/credentials'
import { c_id, c_secret, r_token, a_token } from './secrets'

Credentials.factory(c_id, c_secret, undefined, undefined, r_token).then(
    c => {
        console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`)
    }).catch(e => console.log(`Ups!\n${e.stack}`))