import { Credentials } from '../lib/credentials'
import { EventService, emittedEvent, esFilterBuilderCfg } from '../lib/eventservice'
import { ENTRYPOINT, APPFRERR } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

const entryPoint: ENTRYPOINT = "https://api.us.paloaltonetworks.com"
let lType = ""

function receiver(e: emittedEvent): void {
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

function ctlr(pes: Promise<EventService>): Promise<EventService> {
    console.log('Successfully set a new filter and registered the receiver')
    console.log('Will keep receiving events for 1 minute')
    return new Promise<EventService>((resolve, reject) => {
        pes.then(es => {
            setTimeout(() => {
                console.log('1 minute timer expired. Pausing the poller')
                es.pause()
                resolve(es)
            }, 60000)
        }).catch(e => reject(e))
    })
}

let builderCfg: esFilterBuilderCfg = {
    filter: [
        { table: "panw.traffic" },
        { table: "panw.dpi", timeout: 1000 },
        { table: "panw.threat", where: 'where risk-of-app > 3' }],
    filterOptions: {
        eventCallBack: receiver,
        poolOptions: {
            ack: true,
            pollTimeout: 1000,
            fetchTimeout: 45000
        }
    },
    flush: true
};

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => ctlr(
        EventService.factory(c, entryPoint, true)
            .filterBuilder(builderCfg))
        .then(es => {
            console.log("Clearing the filter and flushing the channel")
            es.clearFilter(true)
        }).catch(e => {
            if (e.name == APPFRERR) {
                let aferr = e as appFerr
                console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
            } else {
                console.log(`General Error\n${e.stack}`)
            }
        }))