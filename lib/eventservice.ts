/**
 * High level abstraction of the Application Framework Event Service
 */

import { PATH, LOGTYPE, isKnownLogType, commonLogger } from './common'
import { coreClass, emittedEvent, coreOptions } from './core'
import { PanCloudError } from './error'
import { setTimeout, clearTimeout } from 'timers'

/**
 * Default amount of milliseconds to wait between ES AutoPoll events
 */
const MSLEEP = 200;
const esPath: PATH = "event-service/v1/channels"

/**
 * Default Event Server {@link esPollOptions} options
 */
let DEFAULT_PO: esPollOptions = { ack: false, pollTimeout: 1000, fetchTimeout: 45000 }
let invalidTables: LOGTYPE[] = ["tms.analytics", "tms.config", "tms.system", "tms.threat"]

/**
 * Event Service emitted message interface
 */
interface esEvent {
    logType: LOGTYPE,
    event: any[]
}

function is_esEvent(obj: any): obj is esEvent {
    if (obj && typeof obj == "object") {
        if ("logType" in obj && typeof obj.logType == "string" && isKnownLogType(obj.logType)) {
            if ("event" in obj && typeof obj.event == "object" && obj.event instanceof Array) {
                return true
            }
        }
    }
    return false
}

/**
 * Interface that describes an Event Service filter
 */
export interface esFilter {
    filters: {
        [index: string]: {
            filter: string,
            timeout?: number,
            batchSize?: number
        }
    }[],
    flush?: boolean
}

function is_esFilter(obj: any): obj is esFilter {
    if (obj && typeof obj == "object") {
        if ("filters" in obj && typeof obj.filters == "object" && obj.filters instanceof Array) {
            let obj2 = obj.filters as {}[]
            return obj2.every(e => {
                if (e && typeof e == "object") {
                    let obj2_e = Object.entries(e)
                    if (obj2_e.length == 1 && typeof obj2_e[0][0] == "string" && typeof obj2_e[0][1] == "object") {
                        let obj3 = obj2_e[0][1] as any
                        return (
                            typeof obj3['filter'] == "string" &&
                            ["number", "undefined"].includes(typeof obj3['timeout']) &&
                            ["number", "undefined"].includes(typeof obj3['batchSize']))
                    }
                    return false
                }
                return false
            })
        }
    }
    return false
}

interface esPollOptions {
    pollTimeout: number,
    fetchTimeout: number,
    ack: boolean
}

interface esFilterOptions {
    eventCallBack?(e: emittedEvent): void,
    correlationCallBack?(): void, // TODO: define interface for correlation messages
    pcapCallBack?(): void, // TODO: define interface for pcap messages
    sleep?: number,
    poolOptions?: esPollOptions
}

/**
 * Interface that describes a valid Event Service filter configuration
 */
export interface esFilterCfg {
    filter: esFilter,
    filterOptions: esFilterOptions
}

/**
 * High level interface to build a valid {@link esFilterCfg} object using the {@link EventService.filterBuilder} method
 */
export interface esFilterBuilderCfg {
    filter: {
        table: LOGTYPE,
        where?: string,
        timeout?: number,
        batchSize?: number
    }[],
    filterOptions: esFilterOptions,
    flush?: boolean
}

export interface esOptions {
    channelId?: string,
}

/**
 * High-level class that implements an Application Framework Event Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export class EventService extends coreClass {
    private filterUrl: string
    private pollUrl: string
    private ackUrl: string
    private nackUrl: string
    private flushUrl: string
    private popts: esPollOptions
    private ap_sleep: number
    private tout: NodeJS.Timeout | undefined
    private polling: boolean
    private eevent: emittedEvent

    private constructor(ops: esOptions & coreOptions) {
        super({
            credential: ops.credential,
            entryPoint: ops.entryPoint,
            allowDup: ops.allowDup,
            level: ops.level
        })
        this.className = "EventService"
        if (!ops.channelId) { ops.channelId = 'EventFilter' }
        this.setChannel(ops.channelId)
        this.popts = DEFAULT_PO
        this.ap_sleep = MSLEEP
        this.polling = false
        this.eevent = { source: "EventService" }
    }

    private setChannel(channelId: string): void {
        this.filterUrl = `${this.entryPoint}/${esPath}/${channelId}/filters`
        this.pollUrl = `${this.entryPoint}/${esPath}/${channelId}/poll`
        this.ackUrl = `${this.entryPoint}/${esPath}/${channelId}/ack`
        this.nackUrl = `${this.entryPoint}/${esPath}/${channelId}/nack`
        this.flushUrl = `${this.entryPoint}/${esPath}/${channelId}/flush`
    }

    /**
     * Static factory method to instantiate an Event Service object
     * @param esOps Instantitation configuration object accepting parameters from {@link core.coreOptions} and
     * {@link esOptions}
     * @returns an instantiated {@link EventService} object
     */
    static factory(esOps: esOptions & coreOptions): EventService {
        return new EventService(esOps)
    }

    /**
     * @returns the current Event Service filter configuration
     */
    async getFilters(): Promise<esFilter> {
        let r_json = await this.fetchGetWrap(this.filterUrl);
        this.lastResponse = r_json
        if (is_esFilter(r_json)) {
            return r_json
        }
        throw new PanCloudError(this, 'PARSER', `response is not a valid ES Filter: ${JSON.stringify(r_json)}`)
    }

    /**
     * Sets a new Event Service configuration
     * @param fcfg The new service configuration. If the configuration includes a valid callBack handler (currently
     * only {@link esFilterCfg.filterOptions.eventCallBack} is supported) then the class AutoPoll feature is turned on
     * @returns a promise to the current Event Service to ease promise chaining
     */
    async setFilters(fcfg: esFilterCfg): Promise<EventService> {
        this.popts = (fcfg.filterOptions.poolOptions) ? fcfg.filterOptions.poolOptions : DEFAULT_PO
        this.ap_sleep = (fcfg.filterOptions.sleep) ? fcfg.filterOptions.sleep : MSLEEP
        await this.void_X_Operation(this.filterUrl, JSON.stringify(fcfg.filter), 'PUT')
        if (fcfg.filterOptions.eventCallBack || fcfg.filterOptions.pcapCallBack || fcfg.filterOptions.correlationCallBack) {
            this.newEmitter(fcfg.filterOptions.eventCallBack, fcfg.filterOptions.pcapCallBack, fcfg.filterOptions.correlationCallBack)
            EventService.autoPoll(this)
        } else if (this.tout) {
            clearTimeout(this.tout)
            this.tout = undefined
        }
        return this
    }

    /**
     * Convenience function to set a valid {@link esFilterCfg} configuration in the Event Service using a
     * description object
     * @param fbcfg The filter description object
     * @returns a promise to the current Event Service to ease promise chaining
     */
    filterBuilder(fbcfg: esFilterBuilderCfg): Promise<EventService> {
        if (fbcfg.filter.some(f => invalidTables.includes(f.table))) {
            throw new PanCloudError(this, 'CONFIG', 'PanCloudError() only "tms.traps" is accepted in the EventService')
        }
        let fcfg: esFilterCfg = {
            filter: {
                filters: fbcfg.filter.map(e => {
                    let m: {
                        [index: string]: {
                            filter: string,
                            timeout?: number,
                            batchSize?: number
                        }
                    } = {}
                    m[e.table] = { filter: `select * from \`${e.table}\`` }
                    if (e.where) {
                        m[e.table].filter += ` where ${e.where}`
                    }
                    m[e.table].timeout = e.timeout
                    m[e.table].batchSize = e.batchSize
                    return m
                })
            },
            filterOptions: fbcfg.filterOptions
        }
        if (fbcfg.flush) {
            fcfg.filter.flush = true
        }
        return this.setFilters(fcfg)
    }

    /**
     * Sets an empty filter in the Event Service
     * @param flush Optinal `flush` attribute (defaults to `false`)
     * @returns a promise to the current Event Service to ease promise chaining
     */
    clearFilter(flush = false): Promise<EventService> {
        let fcfg: esFilterCfg = { filter: { filters: [] }, filterOptions: {} }
        if (flush) {
            fcfg.filter.flush = true
        }
        this.pause()
        return this.setFilters(fcfg)
    }

    /**
     * Performs an `ACK` operation on the Event Service
     */
    async ack(): Promise<void> {
        return this.void_X_Operation(this.ackUrl)
    }

    /**
     * Performs a `NACK` operation on the Event Service
     */
    async nack(): Promise<void> {
        return this.void_X_Operation(this.nackUrl)
    }

    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    async flush(): Promise<void> {
        return this.void_X_Operation(this.flushUrl)
    }

    /**
     * Performs a `POLL` operation on the Event Service
     * @returns a promise that resolves to an array of {@link esEvent} objects
     */
    async poll(): Promise<esEvent[]> {
        let body: string = '{}'
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout })
        }
        let r_json = await this.fetchPostWrap(this.pollUrl, body, this.popts.fetchTimeout);
        this.lastResponse = r_json
        if (r_json && typeof r_json == "object" && r_json instanceof Array) {
            if (r_json.every(e => is_esEvent(e))) {
                if (this.popts.ack) {
                    await this.ack()
                }
                return r_json as esEvent[]
            }
        }
        throw new PanCloudError(this, 'PARSER', 'Response is not a valid ES Event array')
    }

    private static async autoPoll(es: EventService): Promise<void> {
        es.polling = true
        es.tout = undefined
        let e: esEvent[] = []
        try {
            e = await es.poll()
            e.forEach(i => {
                es.eevent.logType = i.logType
                es.eevent.event = i.event
                es.emitEvent(es.eevent)
            })
        } catch (err) {
            commonLogger.error(PanCloudError.fromError(es, err))
        }
        if (es.polling) {
            if (e.length) {
                setImmediate(EventService.autoPoll, es)
            } else {
                es.tout = setTimeout(EventService.autoPoll, es.ap_sleep, es)
            }
        }
    }

    /**
     * Stops this class AutoPoll feature for this Event Service instance
     */
    pause(): void {
        this.polling = false
        if (this.tout) {
            clearTimeout(this.tout)
            this.tout = undefined
        }
    }

    /**
     * (Re)Starts the AutoPoll feature for this Event Service instance. Typically the user won't start the
     * AutoPoll feature using this method but providing a valid callback in the {@link filterOptions} when calling
     * the method {@link EventService.setFilters}
     */
    resume(): void {
        EventService.autoPoll(this)
    }
}