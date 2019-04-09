// Copyright 2015-2019 Palo Alto Networks, Inc
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * High level abstraction of the Application Framework Logging Service
 */

import { ApiPath, isKnownLogType, LogType, commonLogger } from './common'
import { Emitter, EmitterOptions, EmitterInterface, EmitterStats, L2correlation } from './emitter'
import { PanCloudError, isSdkError, SdkErr } from './error'
import { setTimeout } from 'timers';
import { Credentials } from './credentials';
import { EventEmitter } from 'events';

/**
 * Default delay (in milliseconds) between successive polls (auto-poll feature). It can be overrided in the
 * function signature
 */
const MSLEEP = 200;
const LSPATH: ApiPath = "logging-service/v1"
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

/** Runtime statistics provided by the LoggingService class */
interface LsStats extends EmitterStats {
    /**
     * Number of records retrieved from the Application Framework
     */
    records: number,
    /**
     * Number of **POST** calls to the **\/** entry point
     */
    queries: number,
    /**
     * Number of **GET** calls to the **\/** entry point
     */
    polls: number,
    /**
     * Number of **DELETE** calls to the **\/** entry point
     */
    deletes: number
    writes: number
}

/**
 * Interface to provide a query
 */
export interface LsQueryCfg {
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
     * has meaning to your application. If specified, this field must contained a wellformed
     * JSON object. The data specified on this field is echoed back in all result
     * sequences returned in response to the query
     */
    clientParameters?: any
    /**
     * Not mandatory but highly recommended for async operations. Providing the log type here will
     * prevent the event receiver from having to "guess" the log type by scanning the results
     */
    logType?: LogType,
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
        event?: ((e: EmitterInterface<any[]>) => void),
        /**
         * A receiver for the **PCAP_EVENT** topic
         */
        pcap?: ((p: EmitterInterface<Buffer>) => void),
        /**
         * A receiver for the **CORR_EVENT** topic
         */
        corr?: ((e: EmitterInterface<L2correlation[]>) => void)
    }
}

/**
 * main properties of the Logging Service job result schema
 */
export interface JobResult {
    queryId: string,
    sequenceNo: number,
    queryStatus: jobStatus,
    clientParameters: any
    result: {
        esResult: null | {
            hits: {
                hits: {
                    _index: string,
                    _type: string,
                    _source: any
                }[],
                total?: number
            }
        }
    }
}

function isJobResult(obj: any): obj is JobResult {
    let sf = obj && typeof obj == 'object'
    sf = sf && 'queryId' in obj && typeof obj.queryId == 'string'
    sf = sf && 'sequenceNo' in obj && typeof obj.sequenceNo == 'number'
    sf = sf && 'queryStatus' in obj && typeof obj.queryStatus == 'string' && isJobStatus(obj.queryStatus)
    sf = sf && 'clientParameters' in obj && typeof obj.clientParameters == 'object'
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
    logtype: LogType | undefined,
    sequenceNo: number,
    resolve: (jResult: JobResult) => void,
    reject: (reason: any) => void,
    maxWaitTime?: number
    clientParameters?: any
    totalHits?: number
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
    success: boolean,
    /**
     * Array that contains all of the log record UUIDs that were received in the request. If
     * you identified a UUID field when you registered your app, and you provide UUIDs
     * on your log records, then those UUIDs are included in this array. Otherwise, UUIDs
     * assigned by the Logging Service are included in this array
     */
    uuids: string[]
}

function isWriteResult(obj: any): obj is WriteResult {
    return typeof obj == 'object' &&
        obj.success && typeof obj.success == 'boolean' &&
        obj.uuids && typeof obj.uuids == 'object' && Array.isArray(obj.uuids)
}

export interface LsControlMessage {
    queryId: string,
    lastKnownStatus: jobStatus,
    totalHits?: number
}

/**
 * Options for the LoggingService class factory
 */
export interface LsOptions extends EmitterOptions {
    /**
     * Amount of milliseconds to wait between consecutive autopoll() attempts. Defaults to **200ms**
     */
    autoPollSleep?: number
    controlListener?: (message: LsControlMessage) => void
}

/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
export class LoggingService extends Emitter {
    private eevent: EmitterInterface<any[]>
    private apSleep: number
    private tout: NodeJS.Timer | undefined
    private jobQueue: { [i: string]: JobEntry }
    private lastProcElement: number
    private pendingQueries: string[]
    private controlEmitter?: EventEmitter
    protected stats: LsStats

    /**
     * Private constructor. Use the class's static `factory()` method instead
     */
    private constructor(cred: Credentials, baseUrl: string, ops?: LsOptions) {
        super(cred, baseUrl, ops)
        this.className = "LoggingService"
        this.eevent = { source: 'LoggingService' }
        this.apSleep = (ops && ops.autoPollSleep) ? ops.autoPollSleep : MSLEEP
        this.jobQueue = {}
        this.lastProcElement = 0
        this.pendingQueries = []
        if (ops && ops.controlListener) {
            this.controlEmitter = new EventEmitter()
            this.controlEmitter.addListener('on', ops.controlListener)
        }
        this.stats = {
            records: 0,
            deletes: 0,
            polls: 0,
            queries: 0,
            writes: 0,
            ...this.stats
        }
    }

    /**
     * Static factory method to instantiate an Event Service object
     * @param cred the **Credentials** object that will be used to obtain JWT access tokens
     * @param lsOps a valid **LsOptions** configuration objet
     * @returns an instantiated **LoggingService** object
     */
    static factory(cred: Credentials, lsOps?: LsOptions): LoggingService {
        commonLogger.info({ className: 'LoggingService' }, `Creating new LoggingService object for entryPoint ${cred.getEntryPoint()}`)
        return new LoggingService(cred, LSPATH, lsOps)
    }

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
    async query(cfg: LsQueryCfg): Promise<JobResult> {
        commonLogger.info(this, `*queries* post request. Query: ${JSON.stringify(cfg)}`)
        this.stats.queries++
        let providedLogType = cfg.logType
        delete cfg.logType
        let providedCallback = cfg.callBack
        delete cfg.callBack
        let cfgStr = JSON.stringify(cfg)
        let rJson = await this.fetchPostWrap('/queries', cfgStr)
        this.lastResponse = rJson
        if (!isJobResult(rJson)) {
            throw new PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(rJson)}`)
        }
        if (rJson.result.esResult) {
            this.stats.records += rJson.result.esResult.hits.hits.length
            if (this.controlEmitter) {
                let ctrlMessage: LsControlMessage = {
                    lastKnownStatus: rJson.queryStatus,
                    queryId: rJson.queryId,
                    totalHits: rJson.result.esResult.hits.total
                }
                this.controlEmitter.emit('on', ctrlMessage)
            }
        }
        if (rJson.queryStatus != "JOB_FAILED") {
            if (providedCallback) {
                if (providedCallback.event) {
                    if (!this.registerEventListener(providedCallback.event)) {
                        commonLogger.info(this, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                if (providedCallback.pcap) {
                    if (!this.registerPcapListener(providedCallback.pcap)) {
                        commonLogger.info(this, "PCAP receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                if (providedCallback.corr) {
                    if (!this.registerCorrListener(providedCallback.corr)) {
                        commonLogger.info(this, "CORR receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                let seq = 0
                let jobPromise = new Promise<JobResult>((resolve, reject) => {
                    this.jobQueue[rJson.queryId] = {
                        logtype: providedLogType,
                        sequenceNo: seq,
                        resolve: resolve,
                        reject: reject,
                        maxWaitTime: cfg.maxWaitTime,
                        clientParameters: cfg.clientParameters
                    }
                })
                this.pendingQueries = Object.keys(this.jobQueue)
                this.eventEmitter(rJson)
                if (rJson.queryStatus == "JOB_FINISHED") {
                    let jobResolver = this.jobQueue[rJson.queryId].resolve
                    this.emitterCleanup(rJson)
                    jobResolver(rJson)
                }
                if (rJson.queryStatus == "FINISHED") {
                    this.jobQueue[rJson.queryId].sequenceNo = rJson.sequenceNo + 1
                }
                if (this.pendingQueries.length > 0 && this.tout === undefined) {
                    this.tout = setTimeout(LoggingService.autoPoll, this.apSleep, this)
                    commonLogger.info(this, "query autopoller scheduled", "QUERY")
                }
                return jobPromise
            }
        }
        return rJson
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
        let targetPath = `/queries/${qid}/${sequenceNo}`
        if (maxWaitTime && maxWaitTime > 0) {
            targetPath += `?maxWaitTime=${maxWaitTime}`
        }
        let rJson = await this.fetchGetWrap(targetPath);
        this.lastResponse = rJson
        if (isJobResult(rJson)) {
            if (rJson.result.esResult) {
                this.stats.records += rJson.result.esResult.hits.hits.length
                if (this.controlEmitter) {
                    let ctrlMessage: LsControlMessage = {
                        lastKnownStatus: rJson.queryStatus,
                        queryId: rJson.queryId,
                        totalHits: rJson.result.esResult.hits.total
                    }
                    this.controlEmitter.emit('on', ctrlMessage)
                }
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
        let jobR: JobResult = {
            queryId: "",
            queryStatus: "RUNNING",
            result: { esResult: null },
            sequenceNo: 0,
            clientParameters: {}
        }
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
                    sequenceNo: 0,
                    clientParameters: jobToCancel.clientParameters
                })
            }
        }
        return this.deleteQuery(qid)
    }

    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled 
     */
    public deleteQuery(queryId: string): Promise<void> {
        commonLogger.info(this, `*queries* delete request. QueryID: ${queryId}`)
        this.stats.deletes++
        return this.voidXOperation(`/queries/${queryId}`, undefined, 'DELETE')
    }

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
    public async write(vendorName: string, logType: string, data: any[]): Promise<WriteResult> {
        this.stats.writes++
        commonLogger.info(this, `*logs* write for vendor name ${vendorName} and log type ${logType}`)
        let rJson = await this.fetchPostWrap(`/logs/${vendorName}/${logType}`, JSON.stringify(data))
        this.lastResponse = rJson
        if (!isWriteResult(rJson)) {
            throw new PanCloudError(this, 'PARSER', `Response is not a valid LS Write Response: ${JSON.stringify(rJson)}`)
        }
        return rJson
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