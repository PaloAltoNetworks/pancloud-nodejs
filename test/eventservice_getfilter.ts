import { autoCredentials, EventService, LogLevel } from 'pancloud-nodejs'

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await autoCredentials()
    let es = await EventService.factory(c)
    let f = await es.getFilters()
    console.log(`Current Filter Entries (flush: ${f.flush})`)
    f.filters.forEach(o => {
        Object.entries(o).forEach(e => {
            console.log(`- Table: ${e[0]} - filter: ${e[1].filter} / batchSize: ${e[1].batchSize} / timeout: ${e[1].timeout}`)
        })
    })
}
