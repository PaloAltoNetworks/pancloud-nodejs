/// <reference types="node" />
import { LOGTYPE, logLevel } from './common';
import { coreClass, coreOptions, coreStats } from './core';
import { macCorrelator, correlationStats } from './l2correlator';
import { EventEmitter } from 'events';
/**
 * coreClass supports "async operations". In this mode, events received by the Framework will be send to its
 * subscribers. Emitted events will be conformant to this interface.
 */
export interface emitterInterface<T> {
    source: string;
    logType?: LOGTYPE;
    message?: T;
}
export interface l2correlation {
    time_generated: string;
    sessionid: string;
    src: string;
    dst: string;
    "extended-traffic-log-mac": string;
    "extended-traffic-log-mac-stc": string;
}
export interface emitterStats extends coreStats {
    eventsEmitted: number;
    pcapsEmitted: number;
    correlationEmitted: number;
    correlationStats?: correlationStats;
}
export interface emitterOptions extends coreOptions {
    allowDup?: boolean;
    level?: logLevel;
    l2Corr?: {
        timeWindow?: number;
        absoluteTime?: boolean;
        gcMultiplier?: number;
    };
}
export declare class emitter extends coreClass {
    /**
     * Hosts the EventEmitter object that will be used in async operations
     */
    protected emitter: EventEmitter;
    private allowDupReceiver;
    private notifier;
    l2enable: boolean;
    l2engine: macCorrelator;
    className: string;
    protected stats: emitterStats;
    protected constructor(ops: emitterOptions);
    private registerListener;
    private unregisterListener;
    /**
     * Register new listeners to the 'event' topic. Enforces listener duplicate check
     * @param l listener
     * @returns true is the listener is accepted. False otherwise (duplicated?)
     */
    protected registerEvenetListener(l: (e: emitterInterface<any[]>) => void): boolean;
    /**
     * Unregisters a listener from the 'event' topic.
     * @param l listener
     */
    protected unregisterEvenetListener(l: (e: emitterInterface<any[]>) => void): void;
    /**
     * @ignore To Be Implemented
     */
    protected registerPcapListener(l: (e: emitterInterface<Buffer>) => void): boolean;
    /**
     * @ignore To Be Implemented
     */
    protected unregisterCorrListener(l: (e: emitterInterface<l2correlation[]>) => void): void;
    /**
     * @ignore To Be Implemented
     */
    protected registerCorrListener(l: (e: emitterInterface<l2correlation[]>) => void): boolean;
    /**
     * @ignore To Be Implemented
     */
    protected unregisterPcapListener(l: (e: emitterInterface<Buffer>) => void): void;
    protected newEmitter(ee?: (e: emitterInterface<any[]>) => void, pe?: (arg: emitterInterface<Buffer>) => void, ce?: (e: emitterInterface<l2correlation[]>) => void): void;
    protected emitMessage(e: emitterInterface<any[]>): void;
    /**
     * Used to send an event to all subscribers in the 'event' topic
     * @param e the event to be sent
     */
    private emitEvent;
    private emitPcap;
    private emitCorr;
    l2CorrFlush(): void;
}
