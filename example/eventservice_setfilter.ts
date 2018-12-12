import { Credentials } from '../lib/credentials'
import { EventService, esFilterBuilderCfg } from '../lib/eventservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic" },
        { table: "panw.dpi" }],
    flush: true,
    filterOptions: {}
}

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => EventService.factory(c, entryPoint, true).filterBuilder(builderCfg))
    .then(() => {
        console.log('Successfully set a new filter')
    }).catch(e => {
        if (e.name == APPFRERR) {
            let aferr = e as appFerr
            console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
        } else {
            console.log(`General Error\n${e.stack}`)
        }
    })