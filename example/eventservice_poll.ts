import { Credentials } from '../lib/credentials'
import { EventService, esFilter } from '../lib/eventservice'
import { C } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => EventService.factory(c, C.ENTRYPOINT.americas, true).poll())
    .then(t => {
        t.forEach(e => {
            console.log(`Event Type: ${e.logType}, Record Count: ${e.event.length}`)
        })
    }).catch(e => {
        if (e.name == C.APPFRERR) {
            let aferr = e as appFerr
            console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
        } else {
            console.log(`General Error\n${e.stack}`)
        }
    })