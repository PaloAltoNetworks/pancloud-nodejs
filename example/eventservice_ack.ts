import { Credentials, EventService, ENTRYPOINT } from 'pancloud-nodejs'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"

export async function main(): Promise<void> {
    let c = await Credentials.factory(c_id, c_secret, undefined, a_token, r_token)
    let es = await EventService.factory(c, entryPoint, true)
    await es.ack()
    console.log("Sucessfully ack'ed the channel")
}