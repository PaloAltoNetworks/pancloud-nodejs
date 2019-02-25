/**
 * High level abstraction of the Application Framework Event Service
 */
/// <reference types="node" />
import { LOGTYPE, ENTRYPOINT } from './common';
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter';
/**
 * Event Service emitted message interface
 */
interface EsEvent {
    logType: LOGTYPE;
    event: any[];
}
/**
 * Interface that describes an Event Service filter
 */
export interface EsFilter {
    filters: {
        [index: string]: {
            filter: string;
            timeout?: number;
            batchSize?: number;
        };
    }[];
    flush?: boolean;
}
interface EsPollOptions {
    pollTimeout: number;
    ack: boolean;
}
interface EsFilterOptions {
    callBack?: {
        event?: ((e: EmitterInterface<any[]>) => void);
        pcap?: ((p: EmitterInterface<Buffer>) => void);
        corr?: ((e: EmitterInterface<L2correlation[]>) => void);
    };
    sleep?: number;
    poolOptions?: EsPollOptions;
}
/**
 * Interface that describes a valid Event Service filter configuration
 */
export interface EsFilterCfg {
    filter: EsFilter;
    filterOptions: EsFilterOptions;
}
/**
 * High level interface to build a valid {@link esFilterCfg} object using the {@link EventService.filterBuilder} method
 */
export interface EsFilterBuilderCfg {
    filter: {
        table: LOGTYPE;
        where?: string;
        timeout?: number;
        batchSize?: number;
    }[];
    filterOptions: EsFilterOptions;
    flush?: boolean;
}
export interface EsOptions extends EmitterOptions {
    channelId?: string;
}
export interface EsStats extends EmitterStats {
    records: number;
    polls: number;
    deletes: number;
    filtersets: number;
    filtergets: number;
    acks: number;
    nacks: number;
    flushes: number;
}
/**
 * High-level class that implements an Application Framework Event Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export declare class EventService extends Emitter implements Iterable<Promise<EsEvent[]>> {
    private filterPath;
    private pollPath;
    private ackPath;
    private nackPath;
    private flushPath;
    private popts;
    private apSleep;
    private tout;
    private polling;
    private eevent;
    protected stats: EsStats;
    private constructor();
    private setChannel;
    /**
     * Static factory method to instantiate an Event Service object
     * @param esOps Instantitation configuration object accepting parameters from {@link core.coreOptions} and
     * {@link esOptions}
     * @returns an instantiated {@link EventService} object
     */
    static factory(entryPoint: ENTRYPOINT, esOps: EsOptions): EventService;
    /**
     * @returns the current Event Service filter configuration
     */
    getFilters(): Promise<EsFilter>;
    /**
     * Sets a new Event Service configuration
     * @param fcfg The new service configuration. If the configuration includes a valid callBack handler (currently
     * only {@link esFilterCfg.filterOptions.eventCallBack} is supported) then the class AutoPoll feature is turned on
     * @returns a promise to the current Event Service to ease promise chaining
     */
    setFilters(fcfg: EsFilterCfg): Promise<EventService>;
    /**
     * Convenience function to set a valid {@link esFilterCfg} configuration in the Event Service using a
     * description object
     * @param fbcfg The filter description object
     * @returns a promise to the current Event Service to ease promise chaining
     */
    filterBuilder(fbcfg: EsFilterBuilderCfg): Promise<EventService>;
    /**
     * Sets an empty filter in the Event Service
     * @param flush Optinal `flush` attribute (defaults to `false`)
     * @returns a promise to the current Event Service to ease promise chaining
     */
    clearFilter(flush?: boolean): Promise<EventService>;
    /**
     * Performs an `ACK` operation on the Event Service
     */
    ack(): Promise<void>;
    /**
     * Performs a `NACK` operation on the Event Service
     */
    nack(): Promise<void>;
    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    flush(): Promise<void>;
    [Symbol.iterator](): IterableIterator<Promise<EsEvent[]>>;
    /**
     * Performs a `POLL` operation on the Event Service
     * @returns a promise that resolves to an array of {@link esEvent} objects
     */
    poll(): Promise<EsEvent[]>;
    private static autoPoll;
    /**
     * Stops this class AutoPoll feature for this Event Service instance
     */
    pause(): void;
    /**
     * (Re)Starts the AutoPoll feature for this Event Service instance. Typically the user won't start the
     * AutoPoll feature using this method but providing a valid callback in the {@link filterOptions} when calling
     * the method {@link EventService.setFilters}
     */
    resume(): void;
    getEsStats(): EsStats;
}
export {};
