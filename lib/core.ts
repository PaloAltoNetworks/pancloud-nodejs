import * as fetch from 'node-fetch'
import { Credentials } from './credentials'
import { ApplicationFrameworkError, PanCloudError } from './error'
import { EventEmitter } from 'events'
import { LOGTYPE } from './common';

const EVENT_EVENT = 'EVENT_EVENT'
const PCAP_EVENT = 'PCAP_EVENT'
const CORRELATION_EVENT = 'CORRELATION_EVENT'
type eventTypes = typeof EVENT_EVENT | typeof PCAP_EVENT | typeof CORRELATION_EVENT

export interface emittedEvent {
    source: string,
    logType?: LOGTYPE,
    event?: any
}

export class coreClass {
    protected emitter: EventEmitter
    protected cred: Credentials
    protected entryPoint: string
    protected autoRefresh: boolean
    protected fetchHeaders: { [i: string]: string }
    protected allowDupReceiver: boolean
    private notifier: { [event: string]: boolean }
    lastResponse: any
    static className = "coreClass"

    protected constructor(credential: Credentials, entryPoint: string, autoRefresh: boolean, allowDup = false) {
        this.cred = credential
        this.entryPoint = entryPoint
        this.autoRefresh = autoRefresh
        this.allowDupReceiver = allowDup
        this.setFetchHeaders()
        this.newEmitter()
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
    }

    async refresh(): Promise<void> {
        await this.cred.refresh_access_token()
        this.setFetchHeaders()
    }

    protected async fetchGetWrap(url: string, timeout?: number): Promise<fetch.Response> {
        let rinit: fetch.RequestInit = {
            headers: this.fetchHeaders
        }
        if (timeout) {
            rinit.timeout = timeout
        }
        let r = await fetch.default(url, rinit)
        if (r.status == 401 && this.autoRefresh) {
            await this.cred.refresh_access_token()
            this.setFetchHeaders()
            r = await fetch.default(url, {
                headers: this.fetchHeaders
            })
        }
        return r
    }

    private async fetchXWrap(url: string, method: string, body?: string, timeout?: number): Promise<fetch.Response> {
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
        let r = await fetch.default(url, rinit)
        if (r.status == 401 && this.autoRefresh) {
            await this.cred.refresh_access_token()
            this.setFetchHeaders()
            rinit.headers = this.fetchHeaders
            r = await fetch.default(url, rinit)
        }
        return r
    }

    protected async fetchPostWrap(url: string, body?: string, timeout?: number): Promise<fetch.Response> {
        return this.fetchXWrap(url, "POST", body, timeout)
    }

    protected async fetchPutWrap(url: string, body?: string, timeout?: number): Promise<fetch.Response> {
        return this.fetchXWrap(url, "PUT", body, timeout)
    }

    protected async fetchDeleteWrap(url: string, timeout?: number): Promise<fetch.Response> {
        return this.fetchXWrap(url, "DELETE", undefined, timeout)
    }

    protected async void_X_Operation(url: string, payload?: string, method = "POST"): Promise<void> {
        let res = await this.fetchXWrap(url, method, payload);
        if (res.ok) return
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(coreClass, "PARSER", `Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        throw new ApplicationFrameworkError(coreClass, r_json)
    }
}