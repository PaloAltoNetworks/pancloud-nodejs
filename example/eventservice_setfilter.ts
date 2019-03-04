import { autoCredentials, EventService, EsFilterBuilderCfg, LogLevel } from 'pancloud-nodejs'

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
    let c = await autoCredentials()
    let es = await EventService.factory(entryPoint, {
        credential: c,
        // level: LogLevel.DEBUG
    })
    await es.filterBuilder(builderCfg)
    console.log('Successfully set a new filter')
}