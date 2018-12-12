import { Credentials } from './credentials'
import { PATH, isKnownLogType, LOGTYPE } from './constants'
import { coreClass, emittedEvent } from './core'
import { ApplicationFrameworkError } from './error'
import { setTimeout, clearTimeout } from 'timers';
export { emittedEvent }

const MSLEEP = 200; // milliseconds to sleep between non-empty polls
const lsPath: PATH = "logging-service/v1/queries"
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': ''
}

type jobStatus = keyof typeof jStatus

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
    logType?: LOGTYPE,
}

interface jobResult {
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
    sequenceNo: number
}

export class LoggingService extends coreClass {
    private url: string
    private eevent: emittedEvent
    private ap_sleep: number
    private jobQueue: { [i: string]: jobEntry }

    private constructor(credential: Credentials, entryPoint: string, autoRefresh: boolean) {
        super(credential, entryPoint, autoRefresh)
        this.url = `${this.entryPoint}/${lsPath}`
        this.eevent = { source: 'LoggingService' }
        this.ap_sleep = MSLEEP
        this.jobQueue = {}
    };

    static factory(cred: Credentials, entryPoint: string, autoRefresh = false): LoggingService {
        return new LoggingService(cred, entryPoint, autoRefresh)
    }

    async query(cfg: lsQuery, eCallBack?: (e: emittedEvent) => void, sleep = 200): Promise<jobResult> {
        let res = await this.fetchPostWrap(this.url, JSON.stringify(cfg))
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        this.lastResponse = r_json
        if (!res.ok) {
            throw new ApplicationFrameworkError(r_json)
        }
        if (!(isJobResult(r_json))) {
            throw new Error(`PanCloudError() response is not a valid LS JOB: ${JSON.stringify(r_json)}`)
        }
        if (eCallBack) {
            this.registerEvenetListener(eCallBack)
            this.jobQueue[r_json.queryId] = { logtype: cfg.logType, sequenceNo: r_json.sequenceNo }
            this.eventEmitter(r_json)
            if (r_json.queryStatus == "JOB_FINISHED") {
                this.emitterCleanup(r_json)
            }
        }
        return r_json
    }

    private eventEmitter(j: jobResult): void {
        if (!(j.result.esResult)) {
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
                // TODO: unified log for the whole SDK
                console.log(`Discarding event with unknown log type: ${lType}`)
            }
        })
    }

    private emitterCleanup(j: jobResult): void {
        this.emitEvent({ source: j.queryId })
        delete this.jobQueue[j.queryId]
    }

    public async delete_query(queryId: string): Promise<void> {
        return this.void_X_Operation(`${this.url}/${queryId}`, undefined, "DELETE")
    }
}