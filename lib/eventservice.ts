/**
 * High level abstraction of the Application Framework Event Service
 */

import { URL } from 'url'
import { PATH, LOGTYPE, isKnownLogType, commonLogger, ENTRYPOINT } from './common'
import { emitter, emitterOptions, emitterInterface, emitterStats, l2correlation } from './emitter'
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
let DEFAULT_PO: esPollOptions = { ack: false, pollTimeout: 1000 }
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
    ack: boolean
}

interface esFilterOptions {
    CallBack?: {
        event?: ((e: emitterInterface<any[]>) => void),
        pcap?: ((p: emitterInterface<Buffer>) => void),
        corr?: ((e: emitterInterface<l2correlation[]>) => void)
    },
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

export interface esOptions extends emitterOptions {
    channelId?: string
}

export interface esStats extends emitterStats {
    records: number,
    polls: number,
    deletes: number,
    filtersets: number,
    filtergets: number,
    acks: number,
    nacks: number,
    flushes: number
}

/**
 * High-level class that implements an Application Framework Event Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export class EventService extends emitter {
    private filterPath: string
    private pollPath: string
    private ackPath: string
    private nackPath: string
    private flushPath: string
    private popts: esPollOptions
    private ap_sleep: number
    private tout: NodeJS.Timeout | undefined
    private polling: boolean
    private eevent: emitterInterface<any[]>
    protected stats: esStats

    private constructor(baseUrl: string, ops: esOptions) {
        super(baseUrl, ops)
        this.className = "EventService"
        if (!ops.channelId) { ops.channelId = 'EventFilter' }
        this.setChannel(ops.channelId)
        this.popts = DEFAULT_PO
        this.ap_sleep = MSLEEP
        this.polling = false
        this.eevent = { source: "EventService" }
        this.stats = {
            acks: 0,
            nacks: 0,
            deletes: 0,
            filtergets: 0,
            filtersets: 0,
            flushes: 0,
            polls: 0,
            records: 0,
            ...this.stats
        }
    }

    private setChannel(channelId: string): void {
        this.filterPath = `/${channelId}/filters`
        this.pollPath = `/${channelId}/poll`
        this.ackPath = `/${channelId}/ack`
        this.nackPath = `/${channelId}/nack`
        this.flushPath = `/${channelId}/flush`
    }

    /**
     * Static factory method to instantiate an Event Service object
     * @param esOps Instantitation configuration object accepting parameters from {@link core.coreOptions} and
     * {@link esOptions}
     * @returns an instantiated {@link EventService} object
     */
    static factory(entryPoint: ENTRYPOINT, esOps: esOptions): EventService {
        return new EventService(new URL(esPath, entryPoint).toString(), esOps)
    }

    /**
     * @returns the current Event Service filter configuration
     */
    async getFilters(): Promise<esFilter> {
        this.stats.filtergets++
        let r_json = await this.fetchGetWrap(this.filterPath);
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
        this.stats.filtersets++
        this.popts = (fcfg.filterOptions.poolOptions) ? fcfg.filterOptions.poolOptions : DEFAULT_PO
        this.ap_sleep = (fcfg.filterOptions.sleep) ? fcfg.filterOptions.sleep : MSLEEP
        await this.void_X_Operation(this.filterPath, JSON.stringify(fcfg.filter), 'PUT')
        if (fcfg.filterOptions.CallBack) {
            this.newEmitter(fcfg.filterOptions.CallBack.event, fcfg.filterOptions.CallBack.pcap, fcfg.filterOptions.CallBack.corr)
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
    public filterBuilder(fbcfg: esFilterBuilderCfg): Promise<EventService> {
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
    public clearFilter(flush = false): Promise<EventService> {
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
    public async ack(): Promise<void> {
        this.stats.acks++
        return this.void_X_Operation(this.ackPath)
    }

    /**
     * Performs a `NACK` operation on the Event Service
     */
    public async nack(): Promise<void> {
        this.stats.nacks++
        return this.void_X_Operation(this.nackPath)
    }

    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    public async flush(): Promise<void> {
        this.stats.flushes++
        return this.void_X_Operation(this.flushPath)
    }

    /**
     * Performs a `POLL` operation on the Event Service
     * @returns a promise that resolves to an array of {@link esEvent} objects
     */
    public async poll(): Promise<esEvent[]> {
        this.stats.polls++
        let body: string = '{}'
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout })
        }
        let r_json = await this.fetchPostWrap(this.pollPath, body);
        this.lastResponse = r_json
        if (r_json && typeof r_json == "object" && r_json instanceof Array) {
            if (r_json.every(e => {
                if (is_esEvent(e)) {
                    this.stats.records += e.event.length
                    return true
                }
                return false
            })) {
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
                es.eevent.message = i.event
                es.emitMessage(es.eevent)
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
    public pause(): void {
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
    public resume(): void {
        EventService.autoPoll(this)
    }

    public getEsStats(): esStats {
        return this.stats
    }
}