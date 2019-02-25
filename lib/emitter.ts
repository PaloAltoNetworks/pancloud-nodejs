import { LOGTYPE, commonLogger, LogLevel } from './common'
import { CoreClass, CoreOptions, CoreStats } from './core'
import { PanCloudError } from './error'
import { MacCorrelator, CorrelatedEvent, CorrelationStats } from './l2correlator'
import { EventEmitter } from 'events'
import { Util } from './util'

const EVENT_EVENT = 'EVENT_EVENT'
const PCAP_EVENT = 'PCAP_EVENT'
const CORR_EVENT = 'CORR_EVENT'
type EventTypes = typeof EVENT_EVENT | typeof PCAP_EVENT | typeof CORR_EVENT

/**
 * coreClass supports "async operations". In this mode, events received by the Framework will be send to its
 * subscribers. Emitted events will be conformant to this interface.
 */
export interface EmitterInterface<T> {
    source: string,
    logType?: LOGTYPE,
    message?: T
}

export interface L2correlation {
    time_generated: string,
    sessionid: string,
    src: string,
    dst: string,
    "extended-traffic-log-mac": string
    "extended-traffic-log-mac-stc": string
}

export interface EmitterStats extends CoreStats {
    eventsEmitted: number,
    pcapsEmitted: number,
    correlationEmitted: number
    correlationStats?: CorrelationStats
}

export interface EmitterOptions extends CoreOptions {
    allowDup?: boolean,
    level?: LogLevel
    l2Corr?: {
        timeWindow?: number
        absoluteTime?: boolean
        gcMultiplier?: number
    }
}

export class Emitter extends CoreClass {
    /**
     * Hosts the EventEmitter object that will be used in async operations
     */
    protected emitter: EventEmitter
    private allowDupReceiver: boolean
    private notifier: { [event: string]: boolean }
    l2enable: boolean
    l2engine: MacCorrelator
    public className: string
    protected stats: EmitterStats

    protected constructor(baseUrl: string, ops: EmitterOptions) {
        super(baseUrl, ops)
        this.className = "emitterClass"
        this.allowDupReceiver = (ops.allowDup == undefined) ? false : ops.allowDup
        this.newEmitter()
        if (ops.level != undefined && ops.level != LogLevel.INFO) {
            commonLogger.level = ops.level
        }
        this.stats = {
            correlationEmitted: 0,
            eventsEmitted: 0,
            pcapsEmitted: 0,
            ...this.stats
        }
        if (ops.l2Corr) {
            this.l2enable = true
            this.l2engine = new MacCorrelator(
                ops.l2Corr.timeWindow,
                ops.l2Corr.absoluteTime,
                ops.l2Corr.gcMultiplier)
            this.stats.correlationStats = this.l2engine.stats
        } else {
            this.l2enable = false
        }
    }

    private registerListener(event: EventTypes, l: (...args: any[]) => void): boolean {
        if (this.allowDupReceiver || !this.emitter.listeners(event).includes(l)) {
            this.emitter.on(event, l)
            this.notifier[event] = true
            return true
        }
        return false
    }

    private unregisterListener(event: EventTypes, l: (...args: any[]) => void): void {
        this.emitter.removeListener(event, l)
        this.notifier[event] = (this.emitter.listenerCount(event) > 0)
    }

    /**
     * Register new listeners to the 'event' topic. Enforces listener duplicate check
     * @param l listener
     * @returns true is the listener is accepted. False otherwise (duplicated?)
     */
    protected registerEvenetListener(l: (e: EmitterInterface<any[]>) => void): boolean {
        return this.registerListener(EVENT_EVENT, l)
    }

    /**
     * Unregisters a listener from the 'event' topic.
     * @param l listener
     */
    protected unregisterEvenetListener(l: (e: EmitterInterface<any[]>) => void): void {
        this.unregisterListener(EVENT_EVENT, l)
    }

    /**
     * @ignore To Be Implemented
     */
    protected registerPcapListener(l: (e: EmitterInterface<Buffer>) => void): boolean {
        return this.registerListener(PCAP_EVENT, l)
    }

    /**
     * @ignore To Be Implemented
     */
    protected unregisterCorrListener(l: (e: EmitterInterface<L2correlation[]>) => void): void {
        this.unregisterListener(CORR_EVENT, l)
    }

    /**
     * @ignore To Be Implemented
     */
    protected registerCorrListener(l: (e: EmitterInterface<L2correlation[]>) => void): boolean {
        return this.registerListener(CORR_EVENT, l)
    }

    /**
     * @ignore To Be Implemented
     */
    protected unregisterPcapListener(l: (e: EmitterInterface<Buffer>) => void): void {
        this.unregisterListener(PCAP_EVENT, l)
    }

    protected newEmitter(
        ee?: (e: EmitterInterface<any[]>) => void,
        pe?: (arg: EmitterInterface<Buffer>) => void,
        ce?: (e: EmitterInterface<L2correlation[]>) => void) {
        this.emitter = new EventEmitter()
        this.emitter.on('error', (err) => {
            commonLogger.error(PanCloudError.fromError(this, err))
        })
        this.notifier = { EVENT_EVEN: false, PCAP_EVENT: false, CORRELATION_EVENT: false }
        if (ee) {
            this.registerEvenetListener(ee)
        }
        if (pe) {
            this.registerPcapListener(pe)
        }
        if (ce) {
            this.registerCorrListener(ce)
        }
    }

    protected emitMessage(e: EmitterInterface<any[]>): void {
        if (this.notifier[PCAP_EVENT]) {
            this.emitPcap(e)
        }
        let epkg = [e]
        let correlated: EmitterInterface<CorrelatedEvent[]> | undefined
        if (this.l2enable) {
            ({ plain: epkg, correlated } = this.l2engine.process(e))
            if (this.notifier[CORR_EVENT] && correlated) {
                this.emitCorr(correlated)
            }
        }
        if (this.notifier[EVENT_EVENT]) {
            if (correlated) {
                this.emitEvent(correlated)
            }
            epkg.forEach(x => this.emitEvent(x))
        }
    }

    /**
     * Used to send an event to all subscribers in the 'event' topic
     * @param e the event to be sent
     */
    private emitEvent(e: EmitterInterface<any[]>): void {
        if (e.message) {
            this.stats.eventsEmitted += e.message.length
        }
        this.emitter.emit(EVENT_EVENT, e)
    }

    private emitPcap(e: EmitterInterface<any[]>): void {
        let message: EmitterInterface<Buffer> = {
            source: e.source,
        }
        if (e.message) {
            e.message.forEach(x => {
                let pcapBody = Util.pcaptize(x)
                if (pcapBody) {
                    this.stats.pcapsEmitted++
                    message.message = pcapBody
                    this.emitter.emit(PCAP_EVENT, message)
                }
            })
        } else {
            this.emitter.emit(PCAP_EVENT, message)
        }
    }

    private emitCorr(e: EmitterInterface<CorrelatedEvent[]>): void {
        if (e.message) {
            this.stats.correlationEmitted += e.message.length
        }
        if (e.message) {
            this.emitter.emit(CORR_EVENT, {
                source: e.source,
                logType: e.logType,
                message: e.message.map(x => <L2correlation>{
                    time_generated: x.time_generated,
                    sessionid: x.sessionid,
                    src: x.src,
                    dst: x.src,
                    "extended-traffic-log-mac": x["extended-traffic-log-mac"],
                    "extended-traffic-log-mac-stc": x["extended-traffic-log-mac-stc"]
                })
            })
        }
    }

    public l2CorrFlush(): void {
        if (this.l2enable) {
            let { plain } = this.l2engine.flush()
            if (this.notifier[EVENT_EVENT]) { plain.forEach(x => this.emitEvent(x)) }
            commonLogger.info(this, "Flushed the L3/L2 Correlation engine DB", "CORRELATION")
        }
    }
}