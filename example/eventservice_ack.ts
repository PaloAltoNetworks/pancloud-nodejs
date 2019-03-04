import { autoCredentials, EventService, LogLevel } from 'pancloud-nodejs'

const entryPoint = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await autoCredentials()
    let es = await EventService.factory(entryPoint, {
        credential: c,
        level: LogLevel.DEBUG
    })
    await es.ack()
    console.log("Sucessfully ack'ed the channel")
}