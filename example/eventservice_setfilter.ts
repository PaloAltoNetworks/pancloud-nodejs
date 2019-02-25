import { EmbededCredentials, EventService, ENTRYPOINT, EsFilterBuilderCfg, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: EsFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic", timeout: 1000, batchSize: 8000 },
        { table: "panw.dpi", timeout: 1000, batchSize: 8000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    flush: false,
    filterOptions: {}
}

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await EmbededCredentials.factory({
        clientId: c_id,
        clientSecret: c_secret,
        refreshToken: r_token,
        accessToken: a_token
    })
    let es = await EventService.factory(entryPoint, {
        credential: c,
        // level: LogLevel.DEBUG
    })
    await es.filterBuilder(builderCfg)
    console.log('Successfully set a new filter')
}