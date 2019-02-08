/**
 * High level abstraction of the Application Framework Logging Service
 */
/// <reference types="node" />
import { LOGTYPE } from './common';
import { emitter, emitterOptions, emitterInterface, emitterStats, l2correlation } from './emitter';
declare const jStatus: {
    'RUNNING': string;
    'FINISHED': string;
    'JOB_FINISHED': string;
    'JOB_FAILED': string;
};
/**
 * Convenience type to guide the user to all possible LS JOB status value
 */
export declare type jobStatus = keyof typeof jStatus;
export interface lsStats extends emitterStats {
    queries: number;
    records: number;
    polls: number;
    deletes: number;
}
/**
 * Interface to provide a query
 */
export interface lsQuery {
    /**
     * SQL SELECT statement that describes the log data you want to retrieve
     */
    query: string;
    /**
     * Log data time end range, inclusive. Specify an integer representing the number of
     * seconds from the Unix epoch in UTC
     */
    endTime: number;
    /**
     * Log data time start range, inclusive. Specify an integer representing the number of
     * seconds from the Unix epoch in UTC
     */
    startTime: number;
    /**
     * Maximum number of milliseconds you want the HTTP connection to the Logging
     * Service to remain open waiting for a response. If the query results can be returned
     * in this amount of time, the operation is effectively a synchronous query, although
     * results can still be returned in multiple batches. If the query cannot be completed in
     * this amount of time, the service closes the HTTP connection, and your application
     * must poll the service for subsequent result sequences.
     * Maximum value is 30000 (30 seconds). If this field is not specified, 0 is used, in
     * which case the HTTP connection is closed immediately upon completion of the
     * HTTP request
     */
    maxWaitTime?: number;
    /**
     * Identifies the application used to query the service. This is a user-defined string
     * intended to help you recognize, evaluate, and process your queries
     */
    client?: string;
    /**
     * Adds context to a query (such as a transaction ID or other unique identifier) which
     * has meaning to your application. If specified, this field must contained a wellformed JSON object. The data specified on this field is echoed back in all result
     * sequences returned in response to the query
     */
    clientParameters?: any;
    /**
     * Not mandatory but highly recommended for async operations. Providing the log type here will
     * prevent the event receiver from having to "guess" the log type by scanning the results
     */
    logType?: LOGTYPE;
}
/**
 * main properties of the Logging Service job result schema
 */
export interface jobResult {
    queryId: string;
    sequenceNo: number;
    queryStatus: jobStatus;
    result: {
        esResult: null | {
            hits: {
                hits: {
                    _index: string;
                    _type: string;
                    _source: any;
                }[];
            };
        };
    };
}
/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export declare class LoggingService extends emitter {
    private url;
    private eevent;
    private ap_sleep;
    private tout;
    private jobQueue;
    private lastProcElement;
    private pendingQueries;
    private fetchTimeout;
    protected stats: lsStats;
    private constructor();
    /**
     * Logging Service object factory method
     * @param ops configuration object for the instance to be created
     * @returns a new Logging Service instance object with the provided configuration
     */
    static factory(ops: emitterOptions): LoggingService;
    /**
     * Performs a Logging Service query call and returns a promise with the response.
     * If the "eCallBack" handler is provided then it will be registered into the event topic and
     * this query will be placed into the auto-poll queue (returned events will be emitted to the handler)
     * @param cfg query configuration object
     * @param eCallBack toggles the auto-poll feature for this query and registers the handler in the 'event' topic
     * so it can receive result events. Providing 'null' will trigger the auto-poll feature for the query but without
     * registering any handler to the 'event' topic (to be used when a handler is already registered to receive events)
     * @param sleep if provided (in milliseconds), it will change this Logging Service object auto-poll delay
     * value (the amount of time between consecutive polls). Please note that this may affect other queries already in
     * the auto-poll queue
     * @param fetchTimeout milliseconds before issuing a timeout exeception. The operation is wrapped by a 'retrier'
     * that will retry the operation. User can change default retry parameters (3 times / 100 ms) using the right
     * class configuration properties
     * @returns a promise with the Application Framework response
     */
    query(cfg: lsQuery, CallBack?: {
        event?: ((e: emitterInterface<any[]>) => void);
        pcap?: ((p: emitterInterface<Buffer>) => void);
        corr?: ((e: emitterInterface<l2correlation[]>) => void);
    }, sleep?: number, fetchTimeout?: number): Promise<jobResult>;
    /**
     * Used for synchronous operations (when the auto-poll feature of a query is not used)
     * @param qid the query id to poll results from
     * @param sequenceNo This number begins at one more than the sequence number returned when
     * you initially create the query, and it must monotonically increase by 1 for each
     * subsequent request. It is permissible to re-request the current sequence number.
     * However, attempts to decrease the sequence number from one request to the
     * next, or to increase this number by more than 1, will result in an error
     * @param maxWaitTime Maximum number of milliseconds you want the HTTP connection to the Logging
     * Service to remain open waiting for a response. If the query cannot be completed
     * in this amount of time, the service closes the HTTP connection without returning
     * results. Either way, to obtain complete query results your application must
     * continue to request result sequences until this API reports either JOB_FINISHED
     * or JOB_FAILED.
     * This parameter's maximum value is 30000 (30 seconds). If this parameter is not
     * specified, 0 is used, in which case the HTTP connection is closed immediately upon
     * completion of the HTTP request
     * @returns a promise with the Application Framework response
     */
    poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<jobResult>;
    private static autoPoll;
    /**
     * User can use this method to cancel (remove) a query from the auto-poll queue
     * @param qid query id to be cancelled
     */
    cancelPoll(qid: string, reject: (r: any) => void, cause?: Error): void;
    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled
     */
    delete_query(queryId: string): Promise<void>;
    private eventEmitter;
    private emitterCleanup;
    getLsStats(): lsStats;
}
export {};
