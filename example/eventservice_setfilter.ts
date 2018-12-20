import { Credentials, EventService, ENTRYPOINT, esFilterBuilderCfg } from 'pancloud-nodejs'
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

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let es = await EventService.factory(c, entryPoint, true)
    await es.filterBuilder(builderCfg)
    console.log('Successfully set a new filter')
}