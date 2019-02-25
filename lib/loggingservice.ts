/**
 * High level abstraction of the Application Framework Logging Service
 */

import { URL } from 'url'
import { PATH, isKnownLogType, LOGTYPE, commonLogger, ENTRYPOINT } from './common'
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter'
import { PanCloudError, isSdkError, SdkErr } from './error'
import { setTimeout } from 'timers';

/**
 * Default delay (in milliseconds) between successive polls (auto-poll feature). It can be overrided in the
 * function signature
 */
const MSLEEP = 200;
const lsPath: PATH = "logging-service/v1/queries"
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': '', 'CANCELLED': ''
}

/**
 * Convenience type to guide the user to all possible LS JOB status value
 */
export type jobStatus = keyof typeof jStatus

function isJobStatus(s: string): s is jobStatus {
    return jStatus.hasOwnProperty(s)
}

let knownIndexes: string[] = ["panw.", "tms."]

export interface LsStats extends EmitterStats {
    queries: number,
    records: number,
    polls: number,
    deletes: number
}
/**
 * Interface to provide a query
 */
export interface LsQuery {
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
export interface JobResult {
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

function isJobResult(obj: any): obj is JobResult {
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

interface JobEntry {
    logtype: LOGTYPE | undefined,
    sequenceNo: number,
    resolve: (jResult: JobResult) => void,
    reject: (reason: any) => void,
    maxWaitTime?: number
}

interface LsOps extends EmitterOptions {
    apSleep?: number
}

/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export class LoggingService extends Emitter {
    private eevent: EmitterInterface<any[]>
    private apSleep: number
    private tout: NodeJS.Timeout | undefined
    private jobQueue: { [i: string]: JobEntry }
    private lastProcElement: number
    private pendingQueries: string[]
    protected stats: LsStats

    private constructor(baseUrl: string, ops: LsOps) {
        super(baseUrl, ops)
        this.className = "LoggingService"
        this.eevent = { source: 'LoggingService' }
        this.apSleep = (ops.apSleep) ? ops.apSleep : MSLEEP
        this.jobQueue = {}
        this.lastProcElement = 0
        this.pendingQueries = []
        this.stats = {
            records: 0,
            deletes: 0,
            polls: 0,
            queries: 0,
            ...this.stats
        }
    }

    /**
     * Logging Service object factory method
     * @param ops configuration object for the instance to be created
     * @returns a new Logging Service instance object with the provided configuration
     */
    static factory(entryPoint: ENTRYPOINT, ops: LsOps): LoggingService {
        return new LoggingService(new URL(lsPath, entryPoint).toString(), ops)
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
    async query(
        cfg: LsQuery,
        CallBack?: {
            event?: ((e: EmitterInterface<any[]>) => void),
            pcap?: ((p: EmitterInterface<Buffer>) => void),
            corr?: ((e: EmitterInterface<L2correlation[]>) => void)
        }): Promise<JobResult> {
        this.stats.queries++
        let providedLogType = cfg.logType
        delete cfg.logType
        let cfgStr = JSON.stringify(cfg)
        let r_json = await this.fetchPostWrap(undefined, cfgStr)
        this.lastResponse = r_json
        if (!(isJobResult(r_json))) {
            throw new PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`)
        }
        if (r_json.result.esResult) {
            this.stats.records += r_json.result.esResult.hits.hits.length
        }
        if (r_json.queryStatus != "JOB_FAILED") {
            if (CallBack !== undefined) {
                if (CallBack.event) {
                    if (!this.registerEvenetListener(CallBack.event)) {
                        commonLogger.info(this, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                if (CallBack.pcap) {
                    if (!this.registerPcapListener(CallBack.pcap)) {
                        commonLogger.info(this, "PCAP receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                if (CallBack.corr) {
                    if (!this.registerCorrListener(CallBack.corr)) {
                        commonLogger.info(this, "CORR receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                let seq = 0
                let jobPromise = new Promise<JobResult>((resolve, reject) => {
                    this.jobQueue[r_json.queryId] = {
                        logtype: providedLogType,
                        sequenceNo: seq,
                        resolve: resolve,
                        reject: reject,
                        maxWaitTime: cfg.maxWaitTime
                    }
                })
                this.pendingQueries = Object.keys(this.jobQueue)
                this.eventEmitter(r_json)
                if (r_json.queryStatus == "JOB_FINISHED") {
                    let jobResolver = this.jobQueue[r_json.queryId].resolve
                    this.emitterCleanup(r_json)
                    jobResolver(r_json)
                }
                if (r_json.queryStatus == "FINISHED") {
                    this.jobQueue[r_json.queryId].sequenceNo = r_json.sequenceNo + 1
                }
                if (this.pendingQueries.length > 0 && this.tout === undefined) {
                    this.tout = setTimeout(LoggingService.autoPoll, this.apSleep, this)
                    commonLogger.info(this, "query autopoller scheduled", "QUERY")
                }
                return jobPromise
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
    async poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<JobResult> {
        this.stats.polls++
        let targetPath = `/${qid}/${sequenceNo}`
        if (maxWaitTime && maxWaitTime > 0) {
            targetPath += `?maxWaitTime=${maxWaitTime}`
        }
        let rJson = await this.fetchGetWrap(targetPath);
        this.lastResponse = rJson
        if (isJobResult(rJson)) {
            if (rJson.result.esResult) {
                this.stats.records += rJson.result.esResult.hits.hits.length
            }
            return rJson
        }
        throw new PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(rJson)}`)
    }

    private static async autoPoll(ls: LoggingService): Promise<void> {
        ls.lastProcElement++
        if (ls.lastProcElement >= ls.pendingQueries.length) {
            ls.lastProcElement = 0
        }
        let currentQid = ls.pendingQueries[ls.lastProcElement]
        let currentJob = ls.jobQueue[currentQid]
        let jobR: JobResult = { queryId: "", queryStatus: "RUNNING", result: { esResult: null }, sequenceNo: 0 }
        try {
            jobR = await ls.poll(currentQid, currentJob.sequenceNo, currentJob.maxWaitTime)
            if (jobR.queryStatus == "JOB_FAILED") {
                commonLogger.alert(ls, `JOB_FAILED returned. Cancelling query ${currentQid}`, 'AUTOPOLL')
                await ls.cancelPoll(currentQid, new PanCloudError(ls, "UNKNOWN", "JOB_FAILED"))
            } else {
                ls.eventEmitter(jobR)
                if (jobR.queryStatus == "FINISHED") {
                    currentJob.sequenceNo++
                }
                if (jobR.queryStatus == "JOB_FINISHED") {
                    ls.emitterCleanup(jobR)
                    currentJob.resolve(jobR)
                }
            }
        } catch (err) {
            if (isSdkError(err)) {
                commonLogger.alert(ls, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL')
                await ls.cancelPoll(currentQid, err)
            } else {
                commonLogger.error(PanCloudError.fromError(ls, err))
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = setTimeout(LoggingService.autoPoll, ls.apSleep, ls)
        } else {
            ls.tout = undefined
            commonLogger.info(ls, "query autopoller de-scheduled", "AUTOPOLL")
        }
    }

    /**
     * User can use this method to cancel (remove) a query from the auto-poll queue
     * @param qid query id to be cancelled 
     */
    public cancelPoll(qid: string, err?: SdkErr): Promise<void> {
        if (qid in this.jobQueue) {
            let jobToCancel = this.jobQueue[qid]
            delete this.jobQueue[qid]
            this.pendingQueries = Object.keys(this.jobQueue)
            if (this.pendingQueries.length == 0 && this.tout) {
                clearTimeout(this.tout)
                this.tout = undefined
                this.l2CorrFlush()
            }
            if (err) {
                jobToCancel.reject(err)
            } else {
                jobToCancel.resolve({
                    queryId: qid,
                    queryStatus: 'CANCELLED',
                    result: {
                        esResult: {
                            hits: {
                                hits: []
                            }
                        }
                    },
                    sequenceNo: 0
                })
            }
        }
        return this.delete_query(qid)
    }

    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled 
     */
    public delete_query(queryId: string): Promise<void> {
        this.stats.deletes++
        return this.voidXOperation(`/${queryId}`, undefined, "DELETE")
    }

    private eventEmitter(j: JobResult): void {
        if (!(j.result.esResult &&
            this.pendingQueries.includes(j.queryId) &&
            j.result.esResult.hits.hits.length > 0)) {
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
        this.eevent.message = j.result.esResult.hits.hits.map(e => e._source)
        this.emitMessage(this.eevent)
    }

    private emitterCleanup(j: JobResult): void {
        let qid = j.queryId
        if (this.pendingQueries.length == 1) {
            this.l2CorrFlush()
        }
        if (qid in this.jobQueue) {
            delete this.jobQueue[qid]
        }
        this.pendingQueries = Object.keys(this.jobQueue)
    }

    public getLsStats(): LsStats {
        return this.stats
    }
}