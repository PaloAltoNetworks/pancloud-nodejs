import { EmbeddedCredentials, EventService, EsFilterBuilderCfg, LogLevel } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint = "https://api.us.paloaltonetworks.com"

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
    let c = await EmbeddedCredentials.factory({
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
    console.log("Event Service stats")
    console.log(JSON.stringify(es.getEsStats(), undefined, " "))
}