/// <reference types="node" />
import { Credentials } from './credentials';
import { EventEmitter } from 'events';
import { LOGTYPE, logLevel } from './common';
export interface emittedEvent {
    source: string;
    logType?: LOGTYPE;
    event?: any[];
}
export interface coreOptions {
    credential: Credentials;
    entryPoint: string;
    autoRefresh?: boolean;
    allowDup?: boolean;
    level?: logLevel;
}
export declare class coreClass {
    protected emitter: EventEmitter;
    protected cred: Credentials;
    protected entryPoint: string;
    protected fetchHeaders: {
        [i: string]: string;
    };
    private autoR;
    protected allowDupReceiver: boolean;
    private notifier;
    lastResponse: any;
    static className: string;
    protected constructor(ops: coreOptions);
    private registerListener;
    private unregisterListener;
    protected registerEvenetListener(l: (e: emittedEvent) => void): boolean;
    protected unregisterEvenetListener(l: (e: emittedEvent) => void): void;
    protected registerCorrelationListener(l: (e: boolean) => void): boolean;
    protected unregisterCorrelationListener(l: (e: boolean) => void): void;
    protected registerPcapListener(l: (e: boolean) => void): boolean;
    protected unregisterPcapListener(l: (e: boolean) => void): void;
    protected newEmitter(ee?: (e: emittedEvent) => void, pe?: (arg: boolean) => void, ce?: (arg: boolean) => void): void;
    protected emitEvent(e: emittedEvent): void;
    private setFetchHeaders;
    refresh(): Promise<void>;
    private checkAutoRefresh;
    private fetchXWrap;
    protected fetchGetWrap(url: string, timeout?: number): Promise<any>;
    protected fetchPostWrap(url: string, body?: string, timeout?: number): Promise<any>;
    protected fetchPutWrap(url: string, body?: string, timeout?: number): Promise<any>;
    protected fetchDeleteWrap(url: string, timeout?: number): Promise<any>;
    protected void_X_Operation(url: string, payload?: string, method?: string): Promise<void>;
}
