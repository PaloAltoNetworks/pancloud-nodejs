import { Credentials } from '../lib/credentials'
import { LoggingService, emittedEvent } from '../lib/loggingservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let now = Math.floor(Date.now() / 1000)
let lType = ""

let finishFunc: () => void

function receiver(e: emittedEvent): void {
    if (!(e.event)) {
        console.log("Received Empty Event (final)")
        finishFunc()
        return
    }
    if (e.logType && e.logType != lType) {
        lType = e.logType
        console.log(`___\nReceiving: Event Type: ${lType} from ${e.source}`)
    }
    if (e.event) {
        process.stdout.write(".")
    } else {
        process.stdout.write("o")
    }
}

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => LoggingService.factory(c, entryPoint, true)).then(
        ls => new Promise((resolve, reject) => {
            finishFunc = resolve
            ls.query({
                query: 'select * from panw.traffic limit 1000',
                startTime: now - 3600,
                endTime: now,
                maxWaitTime: 20000
            }, receiver).then(
                job => {
                    console.log(`\nSuccessfully scheduled the query id: ${job.queryId} with status: ${job.queryStatus}`)
                }).catch(e => reject(e))
        })).catch(e => {
            if (e.name == APPFRERR) {
                let aferr = e as appFerr
                console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
            } else {
                console.log(`General Error\n${e.stack}`)
            }
        })