import { Credentials } from '../lib/credentials'
import { EventService, esFilter } from '../lib/eventservice'
import { C } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    .then(c => EventService.factory(c, C.ENTRYPOINT.americas, true).ack())
    .then(() => { console.log("Sucessfully ack'ed the channel") })
    .catch(e => {
        if (e.name == C.APPFRERR) {
            let aferr = e as appFerr
            console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
        } else {
            console.log(`General Error\n${e.stack}`)
        }
    })