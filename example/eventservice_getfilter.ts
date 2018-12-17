import { Credentials, EventService, ENTRYPOINT } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let es = await EventService.factory(c, entryPoint, true)
    let f = await es.getFilters()
    console.log(`Current Filter Entries (flush: ${f.flush})`)
    f.filters.forEach(o => {
        Object.entries(o).forEach(e => {
            console.log(`- Table: ${e[0]} - filter: ${e[1].filter} / batchSize: ${e[1].batchSize} / timeout: ${e[1].timeout}`)
        })
    })
}
