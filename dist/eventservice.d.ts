import { LOGTYPE } from './common';
import { coreClass, emittedEvent, coreOptions } from './core';
interface esEvent {
    logType: LOGTYPE;
    event: any[];
}
export interface esFilter {
    filters: {
        [index: string]: {
            filter: string;
            timeout?: number;
            batchSize?: number;
        };
    }[];
    flush?: boolean;
}
interface esPollOptions {
    pollTimeout: number;
    fetchTimeout: number;
    ack: boolean;
}
interface esFilterOptions {
    eventCallBack?(e: emittedEvent): void;
    correlationCallBack?(): void;
    pcapCallBack?(): void;
    sleep?: number;
    poolOptions?: esPollOptions;
}
export interface esFilterCfg {
    filter: esFilter;
    filterOptions: esFilterOptions;
}
export interface esFilterBuilderCfg {
    filter: {
        table: LOGTYPE;
        where?: string;
        timeout?: number;
        batchSize?: number;
    }[];
    filterOptions: esFilterOptions;
    flush?: boolean;
}
export interface esOptions {
    channelId?: string;
}
export declare class EventService extends coreClass {
    private filterUrl;
    private pollUrl;
    private ackUrl;
    private nackUrl;
    private flushUrl;
    private popts;
    private ap_sleep;
    private tout;
    private polling;
    private eevent;
    static className: string;
    private constructor();
    setChannel(channelId: string): void;
    static factory(esOps: esOptions & coreOptions): EventService;
    getFilters(): Promise<esFilter>;
    setFilters(fcfg: esFilterCfg): Promise<EventService>;
    filterBuilder(fbcfg: esFilterBuilderCfg): Promise<EventService>;
    clearFilter(flush?: boolean): Promise<EventService>;
    ack(): Promise<void>;
    nack(): Promise<void>;
    flush(): Promise<void>;
    poll(): Promise<esEvent[]>;
    private static autoPoll;
    pause(): void;
    resume(): void;
}
export {};
