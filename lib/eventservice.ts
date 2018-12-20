import { Credentials } from './credentials'
import { PATH, LOGTYPE, isKnownLogType, commonLogger } from './common'
import { coreClass, emittedEvent } from './core'
import { ApplicationFrameworkError, PanCloudError } from './error'
import { setTimeout, clearTimeout } from 'timers'

const MSLEEP = 200; // milliseconds to sleep between non-empty polls
const esPath: PATH = "event-service/v1/channels"
let DEFAULT_PO: esPollOptions = { ack: false, pollTimeout: 1000, fetchTimeout: 45000 }
let invalidTables: LOGTYPE[] = ["tms.analytics", "tms.config", "tms.system", "tms.threat"]

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

export interface esFilterCfg {
    filter: esFilter,
    filterOptions: esFilterOptions
}

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
    static className = "EventService"

    private constructor(credential: Credentials, entryPoint: string, channelId: string, autoRefresh: boolean, allowDup?: boolean) {
        super(credential, entryPoint, autoRefresh, allowDup)
        this.setChannel(channelId)
        this.popts = DEFAULT_PO
        this.ap_sleep = MSLEEP
        this.polling = false
        this.eevent = { source: "EventService" }
    }

    setChannel(channelId: string): void {
        this.filterUrl = `${this.entryPoint}/${esPath}/${channelId}/filters`
        this.pollUrl = `${this.entryPoint}/${esPath}/${channelId}/poll`
        this.ackUrl = `${this.entryPoint}/${esPath}/${channelId}/ack`
        this.nackUrl = `${this.entryPoint}/${esPath}/${channelId}/nack`
        this.flushUrl = `${this.entryPoint}/${esPath}/${channelId}/flush`
    }

    static factory(cred: Credentials, entryPoint: string, autoRefresh = false, channelId = 'EventFilter', allowDup?: boolean): EventService {
        return new EventService(cred, entryPoint, channelId, autoRefresh, allowDup)
    }

    async getFilters(): Promise<esFilter> {
        let res = await this.fetchGetWrap(this.filterUrl);
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(EventService, 'PARSER', `Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        if (!res.ok) {
            throw new ApplicationFrameworkError(EventService, r_json)
        }
        if (is_esFilter(r_json)) {
            return r_json
        }
        throw new PanCloudError(EventService, 'PARSER', `response is not a valid ES Filter: ${JSON.stringify(r_json)}`)
    }

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

    filterBuilder(fbcfg: esFilterBuilderCfg): Promise<EventService> {
        if (fbcfg.filter.some(f => invalidTables.includes(f.table))) {
            throw new PanCloudError(EventService, 'CONFIG', 'PanCloudError() only "tms.traps" is accepted in the EventService')
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

    clearFilter(flush = false): Promise<EventService> {
        let fcfg: esFilterCfg = { filter: { filters: [] }, filterOptions: {} }
        if (flush) {
            fcfg.filter.flush = true
        }
        this.pause()
        return this.setFilters(fcfg)
    }

    async ack(): Promise<void> {
        return this.void_X_Operation(this.ackUrl)
    }

    async nack(): Promise<void> {
        return this.void_X_Operation(this.nackUrl)
    }

    async flush(): Promise<void> {
        return this.void_X_Operation(this.flushUrl)
    }

    async poll(): Promise<esEvent[]> {
        let body: string | undefined
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout })
        }
        let res = await this.fetchPostWrap(this.pollUrl, body, this.popts.fetchTimeout);
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(EventService, 'PARSER', `Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        if (!res.ok) {
            throw new ApplicationFrameworkError(EventService, r_json)
        }
        if (r_json && typeof r_json == "object" && r_json instanceof Array) {
            if (r_json.every(e => is_esEvent(e))) {
                if (this.popts.ack) {
                    await this.ack()
                }
                return r_json as esEvent[]
            }
        }
        throw new PanCloudError(EventService, 'PARSER', 'Response is not a valid ES Event array')
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
            commonLogger.error(PanCloudError.fromError(EventService, err))
        }
        if (es.polling) {
            if (e.length) {
                setImmediate(EventService.autoPoll, es)
            } else {
                es.tout = setTimeout(EventService.autoPoll, es.ap_sleep, es)
            }
        }
    }

    pause(): void {
        this.polling = false
        if (this.tout) {
            clearTimeout(this.tout)
            this.tout = undefined
        }
    }

    resume(): void {
        EventService.autoPoll(this)
    }
}