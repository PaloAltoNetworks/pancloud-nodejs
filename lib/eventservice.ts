import * as fetch from 'node-fetch'
import { Credentials } from './credentials'
import { C } from './constants'
import { ApplicationFrameworkError } from './error'
import { EventEmitter } from 'events';
import { setTimeout, clearTimeout } from 'timers';

const MSLEEP = 200; // milliseconds to sleep between non-empty pools
const EEVENT = 'polldata'
let DEFAULT_PO: pollOptions = { ack: false, pollTimeout: 1000, fetchTimeout: 45000 }

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

export interface esEvent {
    logType: string,
    event: any[]
}

function is_esEvent(obj: any): obj is esEvent {
    if (obj && typeof obj == "object") {
        if ("logType" in obj && typeof obj.logType == "string") {
            if ("event" in obj && typeof obj.event == "object" && obj.event instanceof Array) {
                return true
            }
        }
    }
    return false
}

export interface pollOptions {
    pollTimeout: number,
    fetchTimeout: number,
    ack: boolean
}

export interface filterOptions {
    callBack?(e: esEvent): void,
    sleep?: number,
    po?: pollOptions
}

export interface esFilterBuilderEntry {
    table: string,
    where?: string,
    timeout?: number,
    batchSize?: number,
}

export class EventService {
    private cred: Credentials
    private entryPoint: string
    private filterUrl: string
    private pollUrl: string
    private ackUrl: string
    private nackUrl: string
    private flushUrl: string
    private popts: pollOptions
    private ap_sleep: number
    private emitter: EventEmitter
    private tout: NodeJS.Timeout | undefined
    private polling: boolean
    private autoRefresh: boolean
    private fetchHeaders: { [i: string]: string }

    private constructor(credential: Credentials, entryPoint: string, channelId: string, autoRefresh: boolean) {
        this.cred = credential
        this.entryPoint = entryPoint
        this.setChannel(channelId)
        this.popts = DEFAULT_PO
        this.ap_sleep = MSLEEP
        this.emitter = new EventEmitter()
        this.polling = false
        this.autoRefresh = autoRefresh
        this.setFetchHeaders()
    }

    private setFetchHeaders(): void {
        this.fetchHeaders = {
            'Authorization': 'Bearer ' + this.cred.get_access_token(),
            'Content-Type': 'application/json'
        }
    }

    setChannel(channelId: string): void {
        this.filterUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/filters`
        this.pollUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/poll`
        this.ackUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/ack`
        this.nackUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/nack`
        this.flushUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/flush`
    }

    static factory(cred: Credentials, entryPoint: string, autoRefresh = false, channelId = 'EventFilter'): EventService {
        return new EventService(cred, entryPoint, channelId, autoRefresh)
    }

    async refresh(): Promise<void> {
        await this.cred.refresh_access_token()
        this.setFetchHeaders()
    }

    private async fetchGetWrap(url: string): Promise<fetch.Response> {
        let r = await fetch.default(url, {
            headers: this.fetchHeaders
        })
        if (r.status == 401 && this.autoRefresh) {
            await this.cred.refresh_access_token()
            this.setFetchHeaders()
            r = await fetch.default(url, {
                headers: this.fetchHeaders
            })
        }
        return r
    }

    private async fetchPWrap(url: string, method: string, body?: string): Promise<fetch.Response> {
        let r = await fetch.default(url, {
            headers: this.fetchHeaders,
            method: method,
            body: body
        })
        if (r.status == 401 && this.autoRefresh) {
            await this.cred.refresh_access_token()
            this.setFetchHeaders()
            r = await fetch.default(url, {
                headers: this.fetchHeaders,
                method: method,
                body: body
            })
        }
        return r
    }

    private async void_P_Operation(url: string, payload?: string, method = "POST"): Promise<void> {
        let res = await this.fetchPWrap(url, method, payload);
        if (res.ok) return
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        throw new ApplicationFrameworkError(r_json)
    }

    async getFilters(): Promise<esFilter> {
        let res = await this.fetchGetWrap(this.filterUrl);
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        if (!res.ok) {
            throw new ApplicationFrameworkError(r_json)
        }
        if (is_esFilter(r_json)) {
            return r_json
        }
        throw new Error(`PanCloudError() response is not a valid ES Filter: ${JSON.stringify(r_json)}`)
    }

    async setFilters(filter: esFilter, fopts?: filterOptions): Promise<EventService> {
        this.popts = (fopts && fopts.po) ? fopts.po : DEFAULT_PO
        this.ap_sleep = (fopts && fopts.sleep) ? fopts.sleep : MSLEEP
        await this.void_P_Operation(this.filterUrl, JSON.stringify(filter), 'PUT')
        if (fopts && fopts.callBack) {
            this.emitter = new EventEmitter()
            this.emitter.on(EEVENT, fopts.callBack)
            EventService.autoPoll(this)
        } else if (this.tout) {
            clearTimeout(this.tout)
            this.tout = undefined
        }
        return this
    }

    filterBuilder(entries: esFilterBuilderEntry[], flush = false, fopts?: filterOptions): Promise<EventService> {
        let f: esFilter = {
            filters: entries.map(e => {
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
            }),
        }
        if (flush) {
            f.flush = true
        }
        return this.setFilters(f, fopts)
    }

    clearFilter(flush = false): Promise<EventService> {
        let f: esFilter = { filters: [] }
        if (flush) {
            f.flush = true
        }
        this.pause()
        return this.setFilters(f)
    }

    async ack(): Promise<void> {
        return this.void_P_Operation(this.ackUrl)
    }

    async nack(): Promise<void> {
        return this.void_P_Operation(this.nackUrl)
    }

    async flush(): Promise<void> {
        return this.void_P_Operation(this.flushUrl)
    }

    async poll(): Promise<esEvent[]> {
        let body: string | undefined
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout })
        }
        let res = await this.fetchPWrap(this.pollUrl, "POST", body);
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        if (!res.ok) {
            throw new ApplicationFrameworkError(r_json)
        }
        if (r_json && typeof r_json == "object" && r_json instanceof Array) {
            if (r_json.every(e => is_esEvent(e))) {
                if (this.popts.ack) {
                    await this.ack()
                }
                return r_json as esEvent[]
            }
        }
        throw new Error("PanCloudError() response is not a valid ES Event array")
    }

    private static async autoPoll(es: EventService): Promise<void> {
        es.polling = true
        es.tout = undefined
        let e = await es.poll()
        e.forEach(i => {
            es.emitter.emit(EEVENT, i)
        })
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