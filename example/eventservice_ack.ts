import { autoCredentials, EventService, LogLevel } from 'pancloud-nodejs'

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let es = await EventService.factory(c)
    await es.ack()
    console.log("Sucessfully ack'ed the channel")
}