/**
 * High level abstraction of the Application Framework Event Service
 */

import { URL } from 'url'
import { PATH, LOGTYPE, isKnownLogType, commonLogger, ENTRYPOINT } from './common'
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter'
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
let DEFAULT_PO: EsPollOptions = { ack: false, pollTimeout: 1000 }
let invalidTables: LOGTYPE[] = ["tms.analytics", "tms.config", "tms.system", "tms.threat"]

/**
 * Event Service emitted message interface
 */
interface EsEvent {
    logType: LOGTYPE,
    event: any[]
}

function isEsEvent(obj: any): obj is EsEvent {
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
export interface EsFilter {
    filters: {
        [index: string]: {
            filter: string,
            timeout?: number,
            batchSize?: number
        }
    }[],
    flush?: boolean
}

function isEsFilter(obj: any): obj is EsFilter {
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

interface EsPollOptions {
    pollTimeout: number,
    ack: boolean
}

interface EsFilterOptions {
    callBack?: {
        event?: ((e: EmitterInterface<any[]>) => void),
        pcap?: ((p: EmitterInterface<Buffer>) => void),
        corr?: ((e: EmitterInterface<L2correlation[]>) => void)
    },
    sleep?: number,
    poolOptions?: EsPollOptions
}

/**
 * Interface that describes a valid Event Service filter configuration
 */
export interface EsFilterCfg {
    filter: EsFilter,
    filterOptions: EsFilterOptions
}

/**
 * High level interface to build a valid {@link esFilterCfg} object using the {@link EventService.filterBuilder} method
 */
export interface EsFilterBuilderCfg {
    filter: {
        table: LOGTYPE,
        where?: string,
        timeout?: number,
        batchSize?: number
    }[],
    filterOptions: EsFilterOptions,
    flush?: boolean
}

export interface EsOptions extends EmitterOptions {
    channelId?: string
}

export interface EsStats extends EmitterStats {
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
export class EventService extends Emitter implements Iterable<Promise<EsEvent[]>> {
    private filterPath: string
    private pollPath: string
    private ackPath: string
    private nackPath: string
    private flushPath: string
    private popts: EsPollOptions
    private apSleep: number
    private tout: NodeJS.Timeout | undefined
    private polling: boolean
    private eevent: EmitterInterface<any[]>
    protected stats: EsStats

    private constructor(baseUrl: string, ops: EsOptions) {
        super(baseUrl, ops)
        this.className = "EventService"
        if (!ops.channelId) { ops.channelId = 'EventFilter' }
        this.setChannel(ops.channelId)
        this.popts = DEFAULT_PO
        this.apSleep = MSLEEP
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
    static factory(entryPoint: ENTRYPOINT, esOps: EsOptions): EventService {
        return new EventService(new URL(esPath, entryPoint).toString(), esOps)
    }

    /**
     * @returns the current Event Service filter configuration
     */
    async getFilters(): Promise<EsFilter> {
        this.stats.filtergets++
        let rJson = await this.fetchGetWrap(this.filterPath);
        this.lastResponse = rJson
        if (isEsFilter(rJson)) {
            return rJson
        }
        throw new PanCloudError(this, 'PARSER', `response is not a valid ES Filter: ${JSON.stringify(rJson)}`)
    }

    /**
     * Sets a new Event Service configuration
     * @param fcfg The new service configuration. If the configuration includes a valid callBack handler (currently
     * only {@link esFilterCfg.filterOptions.eventCallBack} is supported) then the class AutoPoll feature is turned on
     * @returns a promise to the current Event Service to ease promise chaining
     */
    async setFilters(fcfg: EsFilterCfg): Promise<EventService> {
        this.stats.filtersets++
        this.popts = (fcfg.filterOptions.poolOptions) ? fcfg.filterOptions.poolOptions : DEFAULT_PO
        this.apSleep = (fcfg.filterOptions.sleep) ? fcfg.filterOptions.sleep : MSLEEP
        await this.voidXOperation(this.filterPath, JSON.stringify(fcfg.filter), 'PUT')
        if (fcfg.filterOptions.callBack) {
            this.newEmitter(fcfg.filterOptions.callBack.event, fcfg.filterOptions.callBack.pcap, fcfg.filterOptions.callBack.corr)
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
    public filterBuilder(fbcfg: EsFilterBuilderCfg): Promise<EventService> {
        if (fbcfg.filter.some(f => invalidTables.includes(f.table))) {
            throw new PanCloudError(this, 'CONFIG', 'PanCloudError() only "tms.traps" is accepted in the EventService')
        }
        let fcfg: EsFilterCfg = {
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
        let fcfg: EsFilterCfg = { filter: { filters: [] }, filterOptions: {} }
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
        return this.voidXOperation(this.ackPath)
    }

    /**
     * Performs a `NACK` operation on the Event Service
     */
    public async nack(): Promise<void> {
        this.stats.nacks++
        return this.voidXOperation(this.nackPath)
    }

    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    public async flush(): Promise<void> {
        this.stats.flushes++
        return this.voidXOperation(this.flushPath)
    }

    public *[Symbol.iterator](): IterableIterator<Promise<EsEvent[]>> {
        while (true) {
            yield this.poll()
        }
    }

    /**
     * Performs a `POLL` operation on the Event Service
     * @returns a promise that resolves to an array of {@link esEvent} objects
     */
    public async poll(): Promise<EsEvent[]> {
        this.stats.polls++
        let body: string = '{}'
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout })
        }
        let rJson = await this.fetchPostWrap(this.pollPath, body);
        this.lastResponse = rJson
        if (rJson && typeof rJson == "object" && rJson instanceof Array) {
            if (rJson.every(e => {
                if (isEsEvent(e)) {
                    this.stats.records += e.event.length
                    return true
                }
                return false
            })) {
                if (this.popts.ack) {
                    await this.ack()
                }
                return rJson as EsEvent[]
            }
        }
        throw new PanCloudError(this, 'PARSER', 'Response is not a valid ES Event array')
    }

    private static async autoPoll(es: EventService): Promise<void> {
        es.polling = true
        es.tout = undefined
        let e: EsEvent[] = []
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
                es.tout = setTimeout(EventService.autoPoll, es.apSleep, es)
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

    public getEsStats(): EsStats {
        return this.stats
    }
}