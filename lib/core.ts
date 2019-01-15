import * as fetch from 'node-fetch'
import { Credentials } from './credentials'
import { ApplicationFrameworkError, PanCloudError } from './error'
import { EventEmitter } from 'events'
import { LOGTYPE, commonLogger, logLevel, retrier } from './common';

const EVENT_EVENT = 'EVENT_EVENT'
const PCAP_EVENT = 'PCAP_EVENT'
const CORRELATION_EVENT = 'CORRELATION_EVENT'
type eventTypes = typeof EVENT_EVENT | typeof PCAP_EVENT | typeof CORRELATION_EVENT

export interface emittedEvent {
    source: string,
    logType?: LOGTYPE,
    event?: any[]
}

export interface coreOptions {
    credential: Credentials,
    entryPoint: string,
    autoRefresh?: boolean,
    allowDup?: boolean,
    level?: logLevel
}

export class coreClass {
    protected emitter: EventEmitter
    protected cred: Credentials
    protected entryPoint: string
    protected fetchHeaders: { [i: string]: string }
    private autoR: boolean
    protected allowDupReceiver: boolean
    private notifier: { [event: string]: boolean }
    lastResponse: any
    static className = "coreClass"

    protected constructor(ops: coreOptions) {
        this.cred = ops.credential
        this.entryPoint = ops.entryPoint
        this.allowDupReceiver = (ops.allowDup == undefined) ? false : ops.allowDup
        this.newEmitter()
        if (ops.level != undefined && ops.level != logLevel.INFO) {
            commonLogger.level = ops.level
        }
        if (ops.autoRefresh == undefined) {
            this.autoR = true
        } else {
            this.autoR = ops.autoRefresh
        }
        this.setFetchHeaders()
    }

    private registerListener(event: eventTypes, l: (...args: any[]) => void): boolean {
        if (this.allowDupReceiver || !this.emitter.listeners(event).includes(l)) {
            this.emitter.on(event, l)
            this.notifier[event] = true
            return true
        }
        return false
    }

    private unregisterListener(event: eventTypes, l: (...args: any[]) => void): void {
        this.emitter.removeListener(event, l)
        this.notifier[event] = (this.emitter.listenerCount(event) > 0)
    }

    protected registerEvenetListener(l: (e: emittedEvent) => void): boolean {
        return this.registerListener(EVENT_EVENT, l)
    }

    protected unregisterEvenetListener(l: (e: emittedEvent) => void): void {
        this.unregisterListener(EVENT_EVENT, l)
    }

    protected registerCorrelationListener(l: (e: boolean) => void): boolean {
        return this.registerListener(CORRELATION_EVENT, l)
    }

    protected unregisterCorrelationListener(l: (e: boolean) => void): void {
        this.unregisterListener(CORRELATION_EVENT, l)
    }

    protected registerPcapListener(l: (e: boolean) => void): boolean {
        return this.registerListener(PCAP_EVENT, l)
    }

    protected unregisterPcapListener(l: (e: boolean) => void): void {
        this.unregisterListener(PCAP_EVENT, l)
    }

    protected newEmitter(ee?: (e: emittedEvent) => void, pe?: (arg: boolean) => void, ce?: (arg: boolean) => void) {
        this.emitter = new EventEmitter()
        this.notifier = { EVENT_EVEN: false, PCAP_EVENT: false, CORRELATION_EVENT: false }
        if (ee) {
            this.registerEvenetListener(ee)
        }
        if (pe) {
            this.registerPcapListener(pe)
        }
        if (ce) {
            this.registerCorrelationListener(ce)
        }
    }

    protected emitEvent(e: emittedEvent) {
        if (this.notifier[EVENT_EVENT]) {
            if (!(e.event)) {
            }
            this.emitter.emit(EVENT_EVENT, e)
        }
    }


    private setFetchHeaders(): void {
        this.fetchHeaders = {
            'Authorization': 'Bearer ' + this.cred.get_access_token(),
            'Content-Type': 'application/json'
        }
        commonLogger.info(coreClass, 'updated authorization header')
    }

    async refresh(): Promise<void> {
        await this.cred.refresh_access_token()
        this.setFetchHeaders()
    }

    private async checkAutoRefresh(): Promise<void> {
        if (this.autoR) {
            if (await this.cred.autoRefresh()) {
                this.setFetchHeaders()
            }
        }
    }

    private async fetchXWrap(url: string, method: string, body?: string, timeout?: number): Promise<any> {
        await this.checkAutoRefresh()
        let rinit: fetch.RequestInit = {
            headers: this.fetchHeaders,
            method: method
        }
        if (timeout) {
            rinit.timeout = timeout
        }
        if (body) {
            rinit.body = body
        }
        commonLogger.debug(coreClass, `fetch operation to ${url}`, method, body)
        let r = await retrier(coreClass, undefined, undefined, fetch.default, url, rinit)
        let r_text = await r.text()
        if (r_text.length == 0) {
            commonLogger.info(coreClass, 'fetch response is null')
            return null
        }
        let r_json: any
        try {
            r_json = JSON.parse(r_text)
        } catch (exception) {
            throw new PanCloudError(coreClass, 'PARSER', `Invalid JSON: ${exception.message}`)
        }
        if (!r.ok) {
            throw new ApplicationFrameworkError(coreClass, r_json)
        }
        commonLogger.debug(coreClass, 'fetch response', undefined, r_json)
        return r_json
    }

    protected async fetchGetWrap(url: string, timeout?: number): Promise<any> {
        return await this.fetchXWrap(url, "GET", undefined, timeout)
    }

    protected async fetchPostWrap(url: string, body?: string, timeout?: number): Promise<any> {
        return await this.fetchXWrap(url, "POST", body, timeout)
    }

    protected async fetchPutWrap(url: string, body?: string, timeout?: number): Promise<any> {
        return await this.fetchXWrap(url, "PUT", body, timeout)
    }

    protected async fetchDeleteWrap(url: string, timeout?: number): Promise<any> {
        return await this.fetchXWrap(url, "DELETE", undefined, timeout)
    }

    protected async void_X_Operation(url: string, payload?: string, method = "POST"): Promise<void> {
        let r_json = await this.fetchXWrap(url, method, payload);
        this.lastResponse = r_json
    }
}