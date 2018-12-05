import { Credentials } from '../lib/credentials'
const c_id = '<cliet_id>'
const c_secret = '<client_secret>'
const r_token = '<refresh_token>'

Credentials.factory(c_id, c_secret, undefined, undefined, r_token).then(
    c => {
        console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`)
    }).catch(e => console.log(`Ups!\n${e.stack}`))