import { embededCredentials, EventService, ENTRYPOINT, esFilterBuilderCfg, logLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

let builderCfg: esFilterBuilderCfg = {
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
    let c = await embededCredentials.factory({
        client_id: c_id,
        client_secret: c_secret,
        refresh_token: r_token,
        access_token: a_token
    })
    let es = await EventService.factory(entryPoint, {
        credential: c,
        // level: logLevel.DEBUG
    })
    await es.filterBuilder(builderCfg)
    let iterations = 10
    for (let prom of es) {
        if (iterations-- == 0) break
        let response = await prom
        console.log(`Processed iteration ${iterations}`)
        response.forEach(e => {
            console.log(`${e.event.length} ${e.logType} events`)
        })
    }
    await es.clearFilter()
}