/**
 * High level abstraction of the Application Framework Event Service
 */

import { URL } from 'url'
import { ApiPath, LogType, isKnownLogType, commonLogger, EntryPoint } from './common'
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter'
import { PanCloudError } from './error'
import { setTimeout, clearTimeout } from 'timers'

/**
 * Default amount of milliseconds to wait between ES AutoPoll events
 */
const MSLEEP = 200;
const esPath: ApiPath = "event-service/v1/channels"

/**
 * Default Event Server {@link esPollOptions} options
 */
let DEFAULT_PO: EsPollOptions = { ack: false, pollTimeout: 1000 }
let invalidTables: LogType[] = ["tms.analytics", "tms.config", "tms.system", "tms.threat"]

/**
 * Event Service emitted message interface
 */
interface EsEvent {
    logType: LogType,
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
    /**
     * Map of filters. The map key must be a valid **string** from the **LogType** type.
     *
     * Consider using the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
     */
    filters: {
        [index: string]: {
            /**
             * You specify a filter using a SQL SELECT statement. You may optionally provide a WHERE predicate to
             * this statement, but no other SQL SELECT clauses are supported. The WHERE predicate can contain only
             * comparison and boolean operators: <, <=, >, >=, =, AND, OR, and NOT. Also, you cannot filter log fields.
             * Regardless of what you express on the SELECT statement, you will receive entire log records as they exist
             * when written to the Logging Service.
             * 
             * In the select statement, you provide a log type where you normally provide a table name.
             * This log type must be enclosed by backticks (`)
             */
            filter: string,
            /**
             * Identifies the maximum amount of time in milliseconds a poll
             * request will wait for events. Note that if the limit specified by batchSize is
             * met, this API will return without waiting for this full timeout value. Default is
             * 60000ms (60 seconds). If 0 is used, poll requests always return immediately.
             * The maximum timeout value is 60000
             */
            timeout?: number,
            /**
             * Identifies the maximum number of events that the Event Service
             * will return when you poll a channel. Default is 1. Minimum is 1
             * 
             * In the event that filters are specified with differing timeout and/or batchSize
             * values, this API will return in the least possible time. That is, if one filter specifies
             * a 1000 timeout value and another specifies 2000, this API will return in 1000
             * milliseconds, or when a filter's batch size value is met, whichever is sooner.
             */
            batchSize?: number
        }
    }[],
    /**
     * If true, the channel is flushed when filters are set. That is, if this field is true and
     * this API reports success (200), all existing events in the channel are discarded. Do
     * this if you are changing your filters to such a degree that you have no interest in
     * events currently existing in the channel. Defaults to **false**
     */
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

/**
 * Configure the Event Service poll operation
 */
interface EsPollOptions {
    /**
     * Integer representing the number of milliseconds for this API to wait before
     * returning. This value has meaning only if the channel is empty of events when the
     * poll operation begins. Default is 1000
     */
    pollTimeout: number,
    /**
     * Boolean value to trigger an automatic **ack()** operation after each successfull poll
     */
    ack: boolean
}

/**
 * Interface with options to modify the way the SDK behaves when a filter is provided
 */
interface EsFilterOptions {
    /**
     * Object with optional callback (event receiver) functions
     */
    callBack?: {
        /**
         * A receiver for the **EVENT_EVENT** topic
         */
        event?: ((e: EmitterInterface<any[]>) => void),
        /**
         * A receiver for the **PCAP_EVENT** topic
         */
        pcap?: ((p: EmitterInterface<Buffer>) => void),
        /**
         * A receiver for the **CORR_EVENT** topic
         */
        corr?: ((e: EmitterInterface<L2correlation[]>) => void)
    },
    /**
     * Parameters to be used by autopoll in case any callBack is provided
     */
    poolOptions?: EsPollOptions
}

/**
 * Low-level Interface that describes a valid Event Service filter configuration
 */
export interface EsFilterCfg {
    /**
     * Map of filters. The map key must be a valid **string** from the **LogType** type. Consider using
     * the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
     */
    filter: EsFilter,
    /**
     * Object with filter configuration options
     */
    filterOptions?: EsFilterOptions
}

/**
 * High level interface to build a valid **EsFilterCfg** object using the **EventService.filterBuilder()** method
 */
export interface EsFilterBuilderCfg {
    /**
     * Array of objects. Each entry will become an Event Service filter
     */
    filter: {
        /**
         * A valid **string** from the LogType options
         */
        table: LogType,
        /**
         * If provided, it will become the predicate of the WHERE clause
         */
        where?: string,
        /**
         * Identifies the maximum amount of time in milliseconds a poll
         * request will wait for events. Note that if the limit specified by batchSize is
         * met, this API will return without waiting for this full timeout value. Default is
         * 60000ms (60 seconds). If 0 is used, poll requests always return immediately.
         * The maximum timeout value is 60000
         */
        timeout?: number,
        /**
         * Identifies the maximum number of events that the Event Service
         * will return when you poll a channel. Default is 1. Minimum is 1
         * 
         * In the event that filters are specified with differing timeout and/or batchSize
         * values, this API will return in the least possible time. That is, if one filter specifies
         * a 1000 timeout value and another specifies 2000, this API will return in 1000
         * milliseconds, or when a filter's batch size value is met, whichever is sooner.
         */
        batchSize?: number
    }[],
    /**
     * Interface with options to modify the way the SDK behaves when a filter is provided
     */
    filterOptions?: EsFilterOptions,
    /**
     * If true, the channel is flushed when filters are set. That is, if this field is true and
     * this API reports success (200), all existing events in the channel are discarded. Do
     * this if you are changing your filters to such a degree that you have no interest in
     * events currently existing in the channel. Defaults to **false**
     */
    flush?: boolean
}

/**
 * Options for the EventService class factory
 */
export interface EsOptions extends EmitterOptions {
    /**
     * The *channel-id* to be used. Defaults to **'EventFilter'**
     */
    channelId?: string
    /**
     * Amount of milliseconds to wait between consecutive autopoll() attempts. Defaults to **200ms**
     */
    autoPollSleep?: number
}

/** 
 * Runtime statistics provided by the EventService class
 */
interface EsStats extends EmitterStats {
    /**
     * Number of records retrieved from the Application Framework
     */
    records: number,
    /**
     * Number of **POST** calls to the **\/poll** entry point
     */
    polls: number,
    /**
     * Number of **PUT** calls to the **\/filters** entry point
     */
    filtersets: number,
    /**
     * Number of **GET** calls to the **\/filters** entry point
     */
    filtergets: number,
    /**
     * Number of **POST** calls to the **\/ack** entry point
     */
    acks: number,
    /**
     * Number of **POST** calls to the **\/nack** entry point
     */
    nacks: number,
    /**
     * Number of **POST** calls to the **\/flush** entry point
     */
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
    private tout: NodeJS.Timer | undefined
    private polling: boolean
    private eevent: EmitterInterface<any[]>
    protected stats: EsStats

    private constructor(baseUrl: string, ops: EsOptions) {
        super(baseUrl, ops)
        this.className = "EventService"
        if (!ops.channelId) { ops.channelId = 'EventFilter' }
        this.setChannel(ops.channelId)
        this.popts = DEFAULT_PO
        this.apSleep = (ops.autoPollSleep) ? ops.autoPollSleep : MSLEEP
        this.polling = false
        this.eevent = { source: "EventService" }
        this.stats = {
            acks: 0,
            nacks: 0,
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
     * @param entryPoint a **string** containing a valid Application Framework API URL
     * @param esOps a valid **EsOptions** configuration objet
     * @returns an instantiated **EventService** object
     */
    static factory(entryPoint: EntryPoint, esOps: EsOptions): EventService {
        commonLogger.info({ className: 'EventService' }, `Creating new EventService object for entryPoint ${entryPoint}`)
        return new EventService(new URL(esPath, entryPoint).toString(), esOps)
    }

    /**
     * @returns the current Event Service filter configuration
     */
    async getFilters(): Promise<EsFilter> {
        this.stats.filtergets++
        commonLogger.info(this, '*filters* get request')
        let rJson = await this.fetchGetWrap(this.filterPath);
        this.lastResponse = rJson
        if (isEsFilter(rJson)) {
            return rJson
        }
        throw new PanCloudError(this, 'PARSER', `response is not a valid ES Filter: ${JSON.stringify(rJson)}`)
    }

    /**
     * Low-level interface to the Event Service set filter API method. Consider using
     * the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
     * @param fcfg The new service configuration. If the configuration includes a valid callBack handler (currently
     * only {@link esFilterCfg.filterOptions.eventCallBack} is supported) then the class AutoPoll feature is turned on
     * @returns a promise to the current Event Service to ease promise chaining
     */
    async setFilters(fcfg: EsFilterCfg): Promise<EventService> {
        commonLogger.info(this, `*filters* put request. Filter: ${JSON.stringify(fcfg)}`)
        this.stats.filtersets++
        this.popts = (fcfg.filterOptions && fcfg.filterOptions.poolOptions) ? fcfg.filterOptions.poolOptions : DEFAULT_PO
        await this.voidXOperation(this.filterPath, JSON.stringify(fcfg.filter), 'PUT')
        if (fcfg.filterOptions && fcfg.filterOptions.callBack) {
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
    public async ack(): Promise<EventService> {
        this.stats.acks++
        commonLogger.info(this, '*ack* get request')
        await this.voidXOperation(this.ackPath)
        return this
    }

    /**
     * Performs a `NACK` operation on the Event Service
     */
    public async nack(): Promise<EventService> {
        this.stats.nacks++
        commonLogger.info(this, '*nack* get request')
        await this.voidXOperation(this.nackPath)
        return this
    }

    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    public async flush(): Promise<EventService> {
        this.stats.flushes++
        commonLogger.info(this, '*flush* get request')
        await this.voidXOperation(this.flushPath)
        return this
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
        commonLogger.info(this, '*poll* get request')
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