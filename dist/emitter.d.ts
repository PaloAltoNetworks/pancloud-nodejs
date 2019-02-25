/// <reference types="node" />
import { LOGTYPE, LogLevel } from './common';
import { CoreClass, CoreOptions, CoreStats } from './core';
import { MacCorrelator, CorrelationStats } from './l2correlator';
import { EventEmitter } from 'events';
/**
 * coreClass supports "async operations". In this mode, events received by the Framework will be send to its
 * subscribers. Emitted events will be conformant to this interface.
 */
export interface EmitterInterface<T> {
    source: string;
    logType?: LOGTYPE;
    message?: T;
}
export interface L2correlation {
    time_generated: string;
    sessionid: string;
    src: string;
    dst: string;
    "extended-traffic-log-mac": string;
    "extended-traffic-log-mac-stc": string;
}
export interface EmitterStats extends CoreStats {
    eventsEmitted: number;
    pcapsEmitted: number;
    correlationEmitted: number;
    correlationStats?: CorrelationStats;
}
export interface EmitterOptions extends CoreOptions {
    allowDup?: boolean;
    level?: LogLevel;
    l2Corr?: {
        timeWindow?: number;
        absoluteTime?: boolean;
        gcMultiplier?: number;
    };
}
export declare class Emitter extends CoreClass {
    /**
     * Hosts the EventEmitter object that will be used in async operations
     */
    protected emitter: EventEmitter;
    private allowDupReceiver;
    private notifier;
    l2enable: boolean;
    l2engine: MacCorrelator;
    className: string;
    protected stats: EmitterStats;
    protected constructor(baseUrl: string, ops: EmitterOptions);
    private registerListener;
    private unregisterListener;
    /**
     * Register new listeners to the 'event' topic. Enforces listener duplicate check
     * @param l listener
     * @returns true is the listener is accepted. False otherwise (duplicated?)
     */
    protected registerEvenetListener(l: (e: EmitterInterface<any[]>) => void): boolean;
    /**
     * Unregisters a listener from the 'event' topic.
     * @param l listener
     */
    protected unregisterEvenetListener(l: (e: EmitterInterface<any[]>) => void): void;
    /**
     * @ignore To Be Implemented
     */
    protected registerPcapListener(l: (e: EmitterInterface<Buffer>) => void): boolean;
    /**
     * @ignore To Be Implemented
     */
    protected unregisterCorrListener(l: (e: EmitterInterface<L2correlation[]>) => void): void;
    /**
     * @ignore To Be Implemented
     */
    protected registerCorrListener(l: (e: EmitterInterface<L2correlation[]>) => void): boolean;
    /**
     * @ignore To Be Implemented
     */
    protected unregisterPcapListener(l: (e: EmitterInterface<Buffer>) => void): void;
    protected newEmitter(ee?: (e: EmitterInterface<any[]>) => void, pe?: (arg: EmitterInterface<Buffer>) => void, ce?: (e: EmitterInterface<L2correlation[]>) => void): void;
    protected emitMessage(e: EmitterInterface<any[]>): void;
    /**
     * Used to send an event to all subscribers in the 'event' topic
     * @param e the event to be sent
     */
    private emitEvent;
    private emitPcap;
    private emitCorr;
    l2CorrFlush(): void;
}
