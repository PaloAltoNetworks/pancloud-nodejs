import { Credentials } from './credentials'
import { PATH, isKnownLogType, LOGTYPE, commonLogger } from './common'
import { coreClass, emittedEvent } from './core'
import { ApplicationFrameworkError, PanCloudError, isSdkError } from './error'
import { setTimeout } from 'timers';

const MSLEEP = 200; // milliseconds to sleep between non-empty polls
const lsPath: PATH = "logging-service/v1/queries"
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': ''
}

export type jobStatus = keyof typeof jStatus

function isJobStatus(s: string): s is jobStatus {
    return jStatus.hasOwnProperty(s)
}

let knownIndexes: string[] = ["panw.", "tms."]

export interface lsQuery {
    query: string,
    endTime: number,
    startTime: number,
    maxWaitTime?: number,
    client?: string,
    clientParameters?: any
    logType?: LOGTYPE
}

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

export class LoggingService extends coreClass {
    private url: string
    private eevent: emittedEvent
    private ap_sleep: number
    private tout: NodeJS.Timeout | undefined
    private jobQueue: { [i: string]: jobEntry }
    private lastProcElement: number
    private pendingQueries: string[]
    private fetchTimeout: number | undefined
    static className = "LoggingService"

    private constructor(credential: Credentials, entryPoint: string, autoRefresh: boolean, allowDup?:boolean) {
        super(credential, entryPoint, autoRefresh, allowDup)
        this.url = `${this.entryPoint}/${lsPath}`
        this.eevent = { source: 'LoggingService' }
        this.ap_sleep = MSLEEP
        this.jobQueue = {}
        this.lastProcElement = 0
        this.pendingQueries = []
    };

    static factory(cred: Credentials, entryPoint: string, autoRefresh = false, allowDup?: boolean): LoggingService {
        return new LoggingService(cred, entryPoint, autoRefresh, allowDup)
    }

    async query(cfg: lsQuery, eCallBack?: ((e: emittedEvent) => void) | null, sleep = MSLEEP, fetchTimeout?: number): Promise<jobResult> {
        this.ap_sleep = sleep
        this.fetchTimeout = fetchTimeout
        let res = await this.fetchPostWrap(this.url, JSON.stringify(cfg), fetchTimeout)
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(LoggingService, 'PARSER', `Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        if (!res.ok) {
            throw new ApplicationFrameworkError(LoggingService, r_json)
        }
        if (!(isJobResult(r_json))) {
            throw new PanCloudError(LoggingService, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`)
        }
        if (r_json.queryStatus != "JOB_FAILED") {
            if (eCallBack !== undefined) {
                if (eCallBack) {
                    if(!this.registerEvenetListener(eCallBack)){
                        commonLogger.info(LoggingService,"Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER")
                    }
                }
                let emptyQueue = this.pendingQueries.length == 0
                let seq = 0
                if (r_json.queryStatus == "FINISHED") {
                    seq = r_json.sequenceNo + 1
                }
                this.jobQueue[r_json.queryId] = { logtype: cfg.logType, sequenceNo: seq, maxWaitTime: cfg.maxWaitTime }
                this.pendingQueries = Object.keys(this.jobQueue)
                this.eventEmitter(r_json)
                if (r_json.queryStatus == "JOB_FINISHED") {
                    await this.emitterCleanup(r_json)
                } else if (emptyQueue) {
                    LoggingService.autoPoll(this)
                }
            }
        }
        return r_json
    }

    async poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<jobResult> {
        let targetUrl = `${this.url}/${qid}/${sequenceNo}`
        if (maxWaitTime && maxWaitTime > 0) {
            targetUrl += `?maxWaitTime=${maxWaitTime}`
        }
        let res = await this.fetchGetWrap(targetUrl, this.fetchTimeout);
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new PanCloudError(LoggingService, 'PARSER', `Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        if (!res.ok) {
            throw new ApplicationFrameworkError(LoggingService, r_json)
        }
        if (isJobResult(r_json)) {
            return r_json
        }
        throw new PanCloudError(LoggingService, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`)
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
            if (jobR.result.esResult) {
                ls.eventEmitter(jobR)
            }
            if (jobR.queryStatus == "FINISHED") {
                currentJob.sequenceNo++
            }
            if (jobR.queryStatus == "JOB_FINISHED") {
                await ls.emitterCleanup(jobR)
            }
        } catch (err) {
            if (isSdkError(err)) {
                commonLogger.alert(LoggingService, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL')
                ls.cancelPoll(currentQid)
            } else {
                commonLogger.error(PanCloudError.fromError(LoggingService, err))
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = setTimeout(LoggingService.autoPoll, ls.ap_sleep, ls)
        }
    }

    cancelPoll(qid: string): void {
        if (qid in this.jobQueue) {
            if (this.pendingQueries.length == 1 && this.tout) {
                clearTimeout(this.tout)
                this.tout = undefined
            }
            delete this.jobQueue[qid]
            this.pendingQueries = Object.keys(this.jobQueue)
        }
    }

    public async delete_query(queryId: string): Promise<void> {
        return this.void_X_Operation(`${this.url}/${queryId}`, undefined, "DELETE")
    }

    private eventEmitter(j: jobResult): void {
        if (!(j.result.esResult && this.pendingQueries.includes(j.queryId))) {
            return
        }
        let lType: string
        this.eevent.source = j.queryId
        this.eevent.logType = this.jobQueue[j.queryId].logtype
        j.result.esResult.hits.hits.forEach(e => {
            if (!(this.eevent.logType)) {
                lType = ""
                knownIndexes.some(p => {
                    if (e._index.includes(p)) {
                        lType = p
                        return true
                    }
                    return false
                })
                lType += e._type
                if (isKnownLogType(lType)) {
                    this.eevent.logType = lType
                }
            }
            if (this.eevent.logType) {
                this.eevent.event = e._source
                this.emitEvent(this.eevent)
            } else {
                commonLogger.alert(LoggingService, `Discarding event with unknown log type: ${lType}`, "EMITTER")
            }
        })
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