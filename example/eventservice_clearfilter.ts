import { Credentials } from '../lib/credentials'
import { EventService, esFilter } from '../lib/eventservice'
import { C } from '../lib/constants'
import { appFerr } from '../lib/error'

const c_id = 'oa2shared'
const c_secret = 'o30J6zjmcPva3DywpwRPrKVXeRQwYuTuaESOQ1imElgO04NRcRuqx905FoNiP1FD'
const r_token = 'Ad7oDC1g7uSAK6ISdSYNxnTRYaqMwwbyl5dbXR1jqO'

Credentials.factory(c_id, c_secret, undefined, undefined, r_token).then(
    c => {
        let es = EventService.factory(c, C.ENTRYPOINT.americas)
        return es.clearFilter()
    }).then(() => {
        console.log('Successfully cleared the filter')
    }).catch(e => {
        if (e.name == C.APPFRERR) {
            let aferr = e as appFerr
            console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
        }
        console.log(`General Error\n${e.stack}`)
    })