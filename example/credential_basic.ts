import { Credentials } from '../lib/credentials'
const c_id = '<client_id>'
const c_secret = '<client_secret>'
const r_token = '<refresh_token>'
const a_token = '<access_token>'

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => {
        console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`)
        console.log('... calling refresh token')
        c.refresh_access_token().then(
            () => { console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`) }
        ).catch(e => console.log(`Ups inner!\n${e.stack}`))
    }).catch(e => console.log(`Ups outter!\n${e.stack}`))