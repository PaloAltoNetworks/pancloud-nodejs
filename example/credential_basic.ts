import { Credentials } from '../lib/credentials'
import { c_id, c_secret, r_token, a_token } from './secrets'

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => {
        console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`)
        console.log('... calling refresh token')
        c.refresh_access_token().then(
            () => { console.log(`Access Token: ${c.get_access_token()}\nExpires In: ${c.get_expiration()}`) }
        ).catch(e => console.log(`Ups inner!\n${e.stack}`))
    }).catch(e => console.log(`Ups outter!\n${e.stack}`))