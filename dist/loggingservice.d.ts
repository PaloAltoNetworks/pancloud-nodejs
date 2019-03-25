/// <reference types="node" />
/**
 * High level abstraction of the Application Framework Logging Service
 */
import { LogType } from './common';
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter';
import { SdkErr } from './error';
import { Credentials } from './credentials';
declare const jStatus: {
    'RUNNING': string;
    'FINISHED': string;
    'JOB_FINISHED': string;
    'JOB_FAILED': string;
    'CANCELLED': string;
};
/**
 * Convenience type to guide the user to all possible LS JOB status value
 */
export declare type jobStatus = keyof typeof jStatus;
/** Runtime statistics provided by the LoggingService class */
interface LsStats extends EmitterStats {
    /**
     * Number of records retrieved from the Application Framework
     */
    records: number;
    /**
     * Number of **POST** calls to the **\/** entry point
     */
    queries: number;
    /**
     * Number of **GET** calls to the **\/** entry point
     */
    polls: number;
    /**
     * Number of **DELETE** calls to the **\/** entry point
     */
    deletes: number;
    writes: number;
}
/**
 * Interface to provide a query
 */
export interface LsQueryCfg {
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
     * has meaning to your application. If specified, this field must contained a wellformed
     * JSON object. The data specified on this field is echoed back in all result
     * sequences returned in response to the query
     */
    clientParameters?: any;
    /**
     * Not mandatory but highly recommended for async operations. Providing the log type here will
     * prevent the event receiver from having to "guess" the log type by scanning the results
     */
    logType?: LogType;
    /**
     * Object with optional callback (event receiver) functions. If present, the call to **query()**
     * will toggle the auto-poll feature for this query and registers the provided handlres in the
     * correspondnig topic so it can receive result events. Providing 'null' will trigger the
     * auto-poll feature for the query but without registering any handler to the 'event' topic
     * (to be used when a handler is already registered to receive events)
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
}
/**
 * main properties of the Logging Service job result schema
 */
export interface JobResult {
    queryId: string;
    sequenceNo: number;
    queryStatus: jobStatus;
    clientParameters: any;
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
 * A success response indicates that the Logging Service received your entire payload, and that the payload
 * contained a valid JSON array of valid JSON objects. Success here does not necessarily mean that your log
 * records have been successfully processed by the Logging Service and can now be queried
 */
interface WriteResult {
    /**
     * This field value is always true
     */
    success: boolean;
    /**
     * Array that contains all of the log record UUIDs that were received in the request. If
     * you identified a UUID field when you registered your app, and you provide UUIDs
     * on your log records, then those UUIDs are included in this array. Otherwise, UUIDs
     * assigned by the Logging Service are included in this array
     */
    uuids: string[];
}
/**
 * Options for the LoggingService class factory
 */
export interface LsOptions extends EmitterOptions {
    /**
     * Amount of milliseconds to wait between consecutive autopoll() attempts. Defaults to **200ms**
     */
    autoPollSleep?: number;
}
/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export declare class LoggingService extends Emitter {
    private eevent;
    private apSleep;
    private tout;
    private jobQueue;
    private lastProcElement;
    private pendingQueries;
    protected stats: LsStats;
    /**
     * Private constructor. Use the class's static `factory()` method instead
     */
    private constructor();
    /**
     * Static factory method to instantiate an Event Service object
     * @param cred the **Credentials** object that will be used to obtain JWT access tokens
     * @param lsOps a valid **LsOptions** configuration objet
     * @returns an instantiated **LoggingService** object
     */
    static factory(cred: Credentials, lsOps?: LsOptions): LoggingService;
    /**
     * Performs a Logging Service query call and returns a promise with the response.
     * If the _CallBack_ handler is provided then it will be registered into the event topic and
     * this query will be placed into the auto-poll queue (returned events will be emitted to the handler)
     * @param cfg query configuration object
     * @param CallBack toggles the auto-poll feature for this query and registers the handler in the 'event' topic
     * so it can receive result events. Providing 'null' will trigger the auto-poll feature for the query but without
     * registering any handler to the 'event' topic (to be used when a handler is already registered to receive events)
     * @returns a promise with the Application Framework response
     */
    query(cfg: LsQueryCfg): Promise<JobResult>;
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
    poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<JobResult>;
    private static autoPoll;
    /**
     * User can use this method to cancel (remove) a query from the auto-poll queue
     * @param qid query id to be cancelled
     */
    cancelPoll(qid: string, err?: SdkErr): Promise<void>;
    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled
     */
    deleteQuery(queryId: string): Promise<void>;
    /**
     * Use this method to write data to the Logging service
     * @param vendorName The vendor name you were given by Palo Alto Networks to use for
     * writing logrecords
     * @param logType The type of log records you're writing to the Logging Service. The type that you
     * provide here must be the log type that you registered with Palo Alto Networks.
     * Also, all log records submitted for this request must conform to this type
     * @param data The logs that you write to the Logging Service must at a minimum include the
     * primary timestamp and log type fields that you identified when you registered your app with
     * Palo Alto Networks. Refer to the documentation for more details
     */
    write(vendorName: string, logType: string, data: any[]): Promise<WriteResult>;
    private eventEmitter;
    private emitterCleanup;
    getLsStats(): LsStats;
}
export {};
