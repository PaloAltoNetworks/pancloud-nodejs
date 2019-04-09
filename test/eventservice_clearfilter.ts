import { autoCredentials, EventService, LogLevel } from 'pancloud-nodejs'

/**
 * Use the enventservice.js launcher to call this main() function
 */
export async function main(): Promise<void> {
    let c = await autoCredentials()
    let es = await EventService.factory(c)
    await es.clearFilter()
    console.log('Successfully cleared the filter')
}
