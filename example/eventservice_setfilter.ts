import { Credentials } from '../lib/credentials'
import { EventService, esFilterBuilderCfg } from '../lib/eventservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic" },
        { table: "panw.dpi" },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    flush: false,
    filterOptions: {}
}

async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let es = await EventService.factory(c, entryPoint, true)
    await es.filterBuilder(builderCfg)
    console.log('Successfully set a new filter')
}

main().then().catch(e => {
    if (e.name == APPFRERR) {
        let aferr = e as appFerr
        console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})
