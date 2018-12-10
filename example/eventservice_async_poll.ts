import { Credentials } from '../lib/credentials'
import { EventService, esEvent } from '../lib/eventservice'
import { C } from '../lib/constants'
import { appFerr } from '../lib/error'
import { c_id, c_secret, r_token, a_token } from './secrets'

function receiver(e: esEvent): void {
    console.log(`Received: Event Type: ${e.logType}, Record Count: ${e.event.length}`)
}

function ctlr(pes: Promise<EventService>): Promise<EventService> {
    console.log('Successfully set a new filter and registered the receiver')
    console.log('Will keep receiving events for 1 minute')
    return new Promise<EventService>(resolve => {
        pes.then(es => {
            setTimeout(() => {
                console.log('1 minute timer expired. Pausing the poller')
                es.pause()
                resolve(es)
            }, 60000)
        })
    })
}

Credentials.factory(c_id, c_secret, undefined, a_token, r_token).then(
    c => ctlr(
        EventService.factory(c, C.ENTRYPOINT.americas, true)
            .filterBuilder([{ table: C.T.PANW_TRAFFIC }, { table: C.T.PANW_DPI }],
                false,
                { callBack: receiver, po: { ack: true, pollTimeout: 10000, fetchTimeout: 45000 } }))
        .then(es => {
            console.log("Clearing the filter and flushing the channel")
            es.clearFilter(true)
        }).catch(e => {
            if (e.name == C.APPFRERR) {
                let aferr = e as appFerr
                console.log(`Application Framework Error fields: code = ${aferr.errorCode}, message = ${aferr.errorMessage}`)
            } else {
                console.log(`General Error\n${e.stack}`)
            }
        }))