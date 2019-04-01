/// <reference types="node" />
import { LogType } from './common';
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter';
import { Credentials } from './credentials';
/**
 * Event Service emitted message interface
 */
interface EsEvent {
    logType: LogType;
    event: any[];
}
/**
 * Interface that describes an Event Service filter
 */
export interface EsFilter {
    /**
     * Map of filters. The map key must be a valid **string** from the **LogType** type.
     *
     * Consider using the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
     */
    filters: {
        [index: string]: {
            /**
             * You specify a filter using a SQL SELECT statement. You may optionally provide a WHERE predicate to
             * this statement, but no other SQL SELECT clauses are supported. The WHERE predicate can contain only
             * comparison and boolean operators: <, <=, >, >=, =, AND, OR, and NOT. Also, you cannot filter log fields.
             * Regardless of what you express on the SELECT statement, you will receive entire log records as they exist
             * when written to the Logging Service.
             *
             * In the select statement, you provide a log type where you normally provide a table name.
             * This log type must be enclosed by backticks (`)
             */
            filter: string;
            /**
             * Identifies the maximum amount of time in milliseconds a poll
             * request will wait for events. Note that if the limit specified by batchSize is
             * met, this API will return without waiting for this full timeout value. Default is
             * 60000ms (60 seconds). If 0 is used, poll requests always return immediately.
             * The maximum timeout value is 60000
             */
            timeout?: number;
            /**
             * Identifies the maximum number of events that the Event Service
             * will return when you poll a channel. Default is 1. Minimum is 1
             *
             * In the event that filters are specified with differing timeout and/or batchSize
             * values, this API will return in the least possible time. That is, if one filter specifies
             * a 1000 timeout value and another specifies 2000, this API will return in 1000
             * milliseconds, or when a filter's batch size value is met, whichever is sooner.
             */
            batchSize?: number;
        };
    }[];
    /**
     * If true, the channel is flushed when filters are set. That is, if this field is true and
     * this API reports success (200), all existing events in the channel are discarded. Do
     * this if you are changing your filters to such a degree that you have no interest in
     * events currently existing in the channel. Defaults to **false**
     */
    flush?: boolean;
}
/**
 * Configure the Event Service poll operation
 */
interface EsPollOptions {
    /**
     * Integer representing the number of milliseconds for this API to wait before
     * returning. This value has meaning only if the channel is empty of events when the
     * poll operation begins. Default is 1000
     */
    pollTimeout: number;
    /**
     * Boolean value to trigger an automatic **ack()** operation after each successfull poll
     */
    ack: boolean;
}
/**
 * Interface with options to modify the way the SDK behaves when a filter is provided
 */
interface EsFilterOptions {
    /**
     * Object with optional callback (event receiver) functions
     */
    callBack?: {
        /**
         * A receiver for the **EVENT_EVENT** topic
         */
        event?: ((e: EmitterInterface<any[]>) => void);
        /**
         * A receiver for the **PCAP_EVENT** topic
         */
        pcap?: ((p: EmitterInterface<Buffer>) => void);
        /**
         * A receiver for the **CORR_EVENT** topic
         */
        corr?: ((e: EmitterInterface<L2correlation[]>) => void);
    };
    /**
     * Parameters to be used by autopoll in case any callBack is provided
     */
    poolOptions?: EsPollOptions;
}
/**
 * Low-level Interface that describes a valid Event Service filter configuration
 */
export interface EsFilterCfg {
    /**
     * Map of filters. The map key must be a valid **string** from the **LogType** type. Consider using
     * the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
     */
    filter: EsFilter;
    /**
     * Object with filter configuration options
     */
    filterOptions?: EsFilterOptions;
}
/**
 * High level interface to build a valid **EsFilterCfg** object using the **EventService.filterBuilder()** method
 */
export interface EsFilterBuilderCfg {
    /**
     * Array of objects. Each entry will become an Event Service filter
     */
    filter: {
        /**
         * A valid **string** from the LogType options
         */
        table: LogType;
        /**
         * If provided, it will become the predicate of the WHERE clause
         */
        where?: string;
        /**
         * Identifies the maximum amount of time in milliseconds a poll
         * request will wait for events. Note that if the limit specified by batchSize is
         * met, this API will return without waiting for this full timeout value. Default is
         * 60000ms (60 seconds). If 0 is used, poll requests always return immediately.
         * The maximum timeout value is 60000
         */
        timeout?: number;
        /**
         * Identifies the maximum number of events that the Event Service
         * will return when you poll a channel. Default is 1. Minimum is 1
         *
         * In the event that filters are specified with differing timeout and/or batchSize
         * values, this API will return in the least possible time. That is, if one filter specifies
         * a 1000 timeout value and another specifies 2000, this API will return in 1000
         * milliseconds, or when a filter's batch size value is met, whichever is sooner.
         */
        batchSize?: number;
    }[];
    /**
     * Interface with options to modify the way the SDK behaves when a filter is provided
     */
    filterOptions?: EsFilterOptions;
    /**
     * If true, the channel is flushed when filters are set. That is, if this field is true and
     * this API reports success (200), all existing events in the channel are discarded. Do
     * this if you are changing your filters to such a degree that you have no interest in
     * events currently existing in the channel. Defaults to **false**
     */
    flush?: boolean;
}
/**
 * Options for the EventService class factory
 */
export interface EsOptions extends EmitterOptions {
    /**
     * The *channel-id* to be used. Defaults to **'EventFilter'**
     */
    channelId?: string;
    /**
     * Amount of milliseconds to wait between consecutive autopoll() attempts. Defaults to **200ms**
     */
    autoPollSleep?: number;
}
/**
 * Runtime statistics provided by the EventService class
 */
interface EsStats extends EmitterStats {
    /**
     * Number of records retrieved from the Application Framework
     */
    records: number;
    /**
     * Number of **POST** calls to the **\/poll** entry point
     */
    polls: number;
    /**
     * Number of **PUT** calls to the **\/filters** entry point
     */
    filtersets: number;
    /**
     * Number of **GET** calls to the **\/filters** entry point
     */
    filtergets: number;
    /**
     * Number of **POST** calls to the **\/ack** entry point
     */
    acks: number;
    /**
     * Number of **POST** calls to the **\/nack** entry point
     */
    nacks: number;
    /**
     * Number of **POST** calls to the **\/flush** entry point
     */
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
    /**
     * Private constructor. Use the class's static `factory()` method instead
     */
    private constructor();
    private setChannel;
    /**
     * Static factory method to instantiate an Event Service object
     * @param cred the **Credentials** object that will be used to obtain JWT access tokens
     * @param esOps a valid **EsOptions** configuration objet
     * @returns an instantiated **EventService** object
     */
    static factory(cred: Credentials, esOps?: EsOptions): EventService;
    /**
     * @returns the current Event Service filter configuration
     */
    getFilters(): Promise<EsFilter>;
    /**
     * Low-level interface to the Event Service set filter API method. Consider using
     * the **filterBuilder(EsFilterBuilderCfg)** method instead to assure a valid filter syntax
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
    ack(): Promise<EventService>;
    /**
     * Performs a `NACK` operation on the Event Service
     */
    nack(): Promise<EventService>;
    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    flush(): Promise<EventService>;
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
