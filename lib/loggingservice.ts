/**
 * High level abstraction of the Application Framework Logging Service
 */

import { PATH, isKnownLogType, LOGTYPE, commonLogger } from './common'
import { coreClass, emittedEvent, coreOptions } from './core'
import { PanCloudError, isSdkError } from './error'
import { setTimeout } from 'timers';

/**
 * Default delay (in milliseconds) between successive polls (auto-poll feature). It can be overrided in the
 * function signature
 */
const MSLEEP = 200;
const lsPath: PATH = "logging-service/v1/queries"
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': ''
}

/**
 * Convenience type to guide the user to all possible LS JOB status value
 */
export type jobStatus = keyof typeof jStatus

function isJobStatus(s: string): s is jobStatus {
    return jStatus.hasOwnProperty(s)
}

let knownIndexes: string[] = ["panw.", "tms."]

/**
 * Interface to provide a query
 */
export interface lsQuery {
    /**
     * SQL SELECT statement that describes the log data you want to retrieve
     */
    query: string,
    /**
     * Log data time end range, inclusive. Specify an integer representing the number of
     * seconds from the Unix epoch in UTC
     */
    endTime: number,
    /**
     * Log data time start range, inclusive. Specify an integer representing the number of
     * seconds from the Unix epoch in UTC
     */
    startTime: number,
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
    maxWaitTime?: number,
    /**
     * Identifies the application used to query the service. This is a user-defined string
     * intended to help you recognize, evaluate, and process your queries
     */
    client?: string,
    /**
     * Adds context to a query (such as a transaction ID or other unique identifier) which
     * has meaning to your application. If specified, this field must contained a wellformed JSON object. The data specified on this field is echoed back in all result
     * sequences returned in response to the query
     */
    clientParameters?: any
    /**
     * Not mandatory but highly recommended for async operations. Providing the log type here will
     * prevent the event receiver from having to "guess" the log type by scanning the results
     */
    logType?: LOGTYPE
}

/**
 * main properties of the Logging Service job result schema
 */
export interface jobResult {
    queryId: string,
    sequenceNo: number,
    queryStatus: jobStatus,
    result: {
        esResult: null | {
            hits: {
                hits: {
                    _index: string,
                    _type: string,
                    _source: any
                }[]
            }
        }
    }
}

function isJobResult(obj: any): obj is jobResult {
    let sf = obj && typeof obj == 'object'
    sf = sf && 'queryId' in obj && typeof obj.queryId == 'string'
    sf = sf && 'sequenceNo' in obj && typeof obj.sequenceNo == 'number'
    sf = sf && 'queryStatus' in obj && typeof obj.queryStatus == 'string' && isJobStatus(obj.queryStatus)
    if (sf && 'result' in obj && typeof obj.result == 'object' && 'esResult' in obj.result) {
        let esr = obj.result.esResult
        if (esr == null) {
            return true
        }
        sf = sf && typeof esr == 'object'
        if (sf = sf && 'hits' in esr && typeof esr.hits == 'object') {
            let h = esr.hits
            sf = sf && 'hits' in h && typeof h.hits == 'object' && h.hits instanceof Array
        } else {
            sf = false
        }
    } else {
        sf = false
    }
    return sf
}

interface jobEntry {
    logtype: LOGTYPE | undefined,
    sequenceNo: number,
    maxWaitTime?: number
}

/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export class LoggingService extends coreClass {
    private url: string
    private eevent: emittedEvent
    private ap_sleep: number
    private tout: NodeJS.Timeout | undefined
    private jobQueue: { [i: string]: jobEntry }
    private lastProcElement: number
    private pendingQueries: string[]
    private fetchTimeout: number | undefined

    private constructor(ops: coreOptions) {
        super(ops)
        this.className = "LoggingService"
        this.url = `${this.entryPoint}/${lsPath}`
        this.eevent = { source: 'LoggingService' }
        this.ap_sleep = MSLEEP
        this.jobQueue = {}
        this.lastProcElement = 0
        this.pendingQueries = []
    };

    /**
     * Logging Service object factory method
     * @param ops configuration object for the instance to be created
     * @returns a new Logging Service instance object with the provided configuration
     */
    static factory(ops: coreOptions): LoggingService {
        return new LoggingService(ops)
    }

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
    async query(cfg: lsQuery, eCallBack?: ((e: emittedEvent) => void) | null, sleep?: number, fetchTimeout?: number): Promise<jobResult> {
        if (sleep) { this.ap_sleep = sleep }
        this.fetchTimeout = fetchTimeout
        let providedLogType = cfg.logType
        delete cfg.logType
        let cfgStr = JSON.stringify(cfg)
        let r_json = await this.fetchPostWrap(this.url, cfgStr, fetchTimeout)
        this.lastResponse = r_json
        if (!(isJobResult(r_json))) {
            throw new PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`)
        }
        if (r_json.queryStatus != "JOB_FAILED") {
            if (eCallBack !== undefined) {
                if (eCallBack) {
                    if (!this.registerEvenetListener(eCallBack)) {
                        commonLogger.info(this, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                let seq = 0
                this.jobQueue[r_json.queryId] = { logtype: providedLogType, sequenceNo: seq, maxWaitTime: cfg.maxWaitTime }
                this.pendingQueries = Object.keys(this.jobQueue)
                this.eventEmitter(r_json)
                if (r_json.queryStatus == "JOB_FINISHED") {
                    await this.emitterCleanup(r_json)
                }
                if (r_json.queryStatus == "FINISHED") {
                    seq = r_json.sequenceNo + 1
                }
                if (this.pendingQueries.length > 0 && this.tout === undefined) {
                    this.tout = setTimeout(LoggingService.autoPoll, this.ap_sleep, this)
                    commonLogger.info(this, "query autopoller scheduled", "QUERY")
                }
            }
        }
        return r_json
    }

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
    async poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<jobResult> {
        let targetUrl = `${this.url}/${qid}/${sequenceNo}`
        if (maxWaitTime && maxWaitTime > 0) {
            targetUrl += `?maxWaitTime=${maxWaitTime}`
        }
        let r_json = await this.fetchGetWrap(targetUrl, this.fetchTimeout);
        this.lastResponse = r_json
        if (isJobResult(r_json)) {
            return r_json
        }
        throw new PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`)
    }

    private static async autoPoll(ls: LoggingService): Promise<void> {
        ls.lastProcElement++
        if (ls.lastProcElement >= ls.pendingQueries.length) {
            ls.lastProcElement = 0
        }
        let currentQid = ls.pendingQueries[ls.lastProcElement]
        let currentJob = ls.jobQueue[currentQid]
        let jobR: jobResult = { queryId: "", queryStatus: "RUNNING", result: { esResult: null }, sequenceNo: 0 }
        try {
            jobR = await ls.poll(currentQid, currentJob.sequenceNo, currentJob.maxWaitTime)
            if (jobR.queryStatus == "JOB_FAILED") {
                commonLogger.alert(ls, `JOB_FAILED returned. Cancelling query ${currentQid}`, 'AUTOPOLL')
                ls.cancelPoll(currentQid)
            } else {
                ls.eventEmitter(jobR)
                if (jobR.queryStatus == "FINISHED") {
                    currentJob.sequenceNo++
                }
                if (jobR.queryStatus == "JOB_FINISHED") {
                    await ls.emitterCleanup(jobR)
                }
            }
        } catch (err) {
            if (isSdkError(err)) {
                commonLogger.error(err)
                commonLogger.alert(ls, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL')
                ls.cancelPoll(currentQid)
            } else {
                commonLogger.error(PanCloudError.fromError(ls, err))
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = setTimeout(LoggingService.autoPoll, ls.ap_sleep, ls)
        } else {
            ls.tout = undefined
            commonLogger.info(ls, "query autopoller de-scheduled", "AUTOPOLL")
        }
    }

    /**
     * User can use this method to cancel (remove) a query from the auto-poll queue
     * @param qid query id to be cancelled 
     */
    public cancelPoll(qid: string): void {
        if (qid in this.jobQueue) {
            if (this.pendingQueries.length == 1 && this.tout) {
                clearTimeout(this.tout)
                this.tout = undefined
                commonLogger.info(this, "query autopoller de-scheduled", "AUTOPOLL")
            }
            delete this.jobQueue[qid]
            this.pendingQueries = Object.keys(this.jobQueue)
            this.emitEvent({ source: qid })
        }
    }

    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled 
     */
    public async delete_query(queryId: string): Promise<void> {
        return this.void_X_Operation(`${this.url}/${queryId}`, undefined, "DELETE")
    }

    private eventEmitter(j: jobResult): void {
        if (!(j.result.esResult && this.pendingQueries.includes(j.queryId))) {
            return
        }
        this.eevent.source = j.queryId
        this.eevent.logType = this.jobQueue[j.queryId].logtype
        if (!this.eevent.logType) {
            if (j.result.esResult.hits.hits.length > 0) {
                let lType = ""
                let firstEntry = j.result.esResult.hits.hits[0]
                knownIndexes.some(p => {
                    if (firstEntry._index.includes(p)) {
                        lType = p
                        return true
                    }
                    return false
                })
                lType += firstEntry._type
                if (isKnownLogType(lType)) {
                    this.eevent.logType = lType
                } else {
                    commonLogger.alert(this, `Discarding event set of unknown log type: ${lType}`, "EMITTER")
                    return
                }
            } else {
                commonLogger.alert(
                    this,
                    `Discarding empty event set from source without known log type: ${JSON.stringify(j).substr(0, 300)}`,
                    "EMITTER")
                return
            }
        }
        this.eevent.event = j.result.esResult.hits.hits.map(e => e._source)
        this.emitEvent(this.eevent)
    }

    private emitterCleanup(j: jobResult): Promise<void> {
        let qid = j.queryId
        this.emitEvent({ source: qid })
        if (qid in this.jobQueue) {
            delete this.jobQueue[qid]
        }
        this.pendingQueries = Object.keys(this.jobQueue)
        return this.delete_query(qid)
    }
}