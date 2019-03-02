"use strict";
/**
 * High level abstraction of the Application Framework Logging Service
 */
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = require("url");
const common_1 = require("./common");
const emitter_1 = require("./emitter");
const error_1 = require("./error");
const timers_1 = require("timers");
/**
 * Default delay (in milliseconds) between successive polls (auto-poll feature). It can be overrided in the
 * function signature
 */
const MSLEEP = 200;
const lsPath = "logging-service/v1";
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': '', 'CANCELLED': ''
};
function isJobStatus(s) {
    return jStatus.hasOwnProperty(s);
}
let knownIndexes = ["panw.", "tms."];
function isJobResult(obj) {
    let sf = obj && typeof obj == 'object';
    sf = sf && 'queryId' in obj && typeof obj.queryId == 'string';
    sf = sf && 'sequenceNo' in obj && typeof obj.sequenceNo == 'number';
    sf = sf && 'queryStatus' in obj && typeof obj.queryStatus == 'string' && isJobStatus(obj.queryStatus);
    sf = sf && 'clientParameters' in obj && typeof obj.clientParameters == 'object';
    if (sf && 'result' in obj && typeof obj.result == 'object' && 'esResult' in obj.result) {
        let esr = obj.result.esResult;
        if (esr == null) {
            return true;
        }
        sf = sf && typeof esr == 'object';
        if (sf = sf && 'hits' in esr && typeof esr.hits == 'object') {
            let h = esr.hits;
            sf = sf && 'hits' in h && typeof h.hits == 'object' && h.hits instanceof Array;
        }
        else {
            sf = false;
        }
    }
    else {
        sf = false;
    }
    return sf;
}
function isWriteResult(obj) {
    return typeof obj == 'object' &&
        obj.success && typeof obj.success == 'boolean' &&
        obj.uuids && typeof obj.uuids == 'object' && Array.isArray(obj.uuids);
}
/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
class LoggingService extends emitter_1.Emitter {
    constructor(baseUrl, ops) {
        super(baseUrl, ops);
        this.className = "LoggingService";
        this.eevent = { source: 'LoggingService' };
        this.apSleep = (ops.autoPollSleep) ? ops.autoPollSleep : MSLEEP;
        this.jobQueue = {};
        this.lastProcElement = 0;
        this.pendingQueries = [];
        this.stats = Object.assign({ records: 0, deletes: 0, polls: 0, queries: 0 }, this.stats);
    }
    /**
     * Static factory method to instantiate an Event Service object
     * @param entryPoint a **string** containing a valid Application Framework API URL
     * @param lsOps a valid **LsOptions** configuration objet
     * @returns an instantiated **LoggingService** object
     */
    static factory(entryPoint, lsOps) {
        return new LoggingService(new url_1.URL(lsPath, entryPoint).toString(), lsOps);
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
    async query(cfg) {
        this.stats.queries++;
        let providedLogType = cfg.logType;
        delete cfg.logType;
        let providedCallback = cfg.callBack;
        delete cfg.callBack;
        let cfgStr = JSON.stringify(cfg);
        let rJson = await this.fetchPostWrap('/queries', cfgStr);
        this.lastResponse = rJson;
        if (!isJobResult(rJson)) {
            throw new error_1.PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(rJson)}`);
        }
        if (rJson.result.esResult) {
            this.stats.records += rJson.result.esResult.hits.hits.length;
        }
        if (rJson.queryStatus != "JOB_FAILED") {
            if (providedCallback) {
                if (providedCallback.event) {
                    if (!this.registerEventListener(providedCallback.event)) {
                        common_1.commonLogger.info(this, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER");
                    }
                }
                if (providedCallback.pcap) {
                    if (!this.registerPcapListener(providedCallback.pcap)) {
                        common_1.commonLogger.info(this, "PCAP receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER");
                    }
                }
                if (providedCallback.corr) {
                    if (!this.registerCorrListener(providedCallback.corr)) {
                        common_1.commonLogger.info(this, "CORR receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER");
                    }
                }
                let seq = 0;
                let jobPromise = new Promise((resolve, reject) => {
                    this.jobQueue[rJson.queryId] = {
                        logtype: providedLogType,
                        sequenceNo: seq,
                        resolve: resolve,
                        reject: reject,
                        maxWaitTime: cfg.maxWaitTime,
                        clientParameters: cfg.clientParameters
                    };
                });
                this.pendingQueries = Object.keys(this.jobQueue);
                this.eventEmitter(rJson);
                if (rJson.queryStatus == "JOB_FINISHED") {
                    let jobResolver = this.jobQueue[rJson.queryId].resolve;
                    this.emitterCleanup(rJson);
                    jobResolver(rJson);
                }
                if (rJson.queryStatus == "FINISHED") {
                    this.jobQueue[rJson.queryId].sequenceNo = rJson.sequenceNo + 1;
                }
                if (this.pendingQueries.length > 0 && this.tout === undefined) {
                    this.tout = timers_1.setTimeout(LoggingService.autoPoll, this.apSleep, this);
                    common_1.commonLogger.info(this, "query autopoller scheduled", "QUERY");
                }
                return jobPromise;
            }
        }
        return rJson;
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
    async poll(qid, sequenceNo, maxWaitTime) {
        this.stats.polls++;
        let targetPath = `/queries/${qid}/${sequenceNo}`;
        if (maxWaitTime && maxWaitTime > 0) {
            targetPath += `?maxWaitTime=${maxWaitTime}`;
        }
        let rJson = await this.fetchGetWrap(targetPath);
        this.lastResponse = rJson;
        if (isJobResult(rJson)) {
            if (rJson.result.esResult) {
                this.stats.records += rJson.result.esResult.hits.hits.length;
            }
            return rJson;
        }
        throw new error_1.PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(rJson)}`);
    }
    static async autoPoll(ls) {
        ls.lastProcElement++;
        if (ls.lastProcElement >= ls.pendingQueries.length) {
            ls.lastProcElement = 0;
        }
        let currentQid = ls.pendingQueries[ls.lastProcElement];
        let currentJob = ls.jobQueue[currentQid];
        let jobR = {
            queryId: "",
            queryStatus: "RUNNING",
            result: { esResult: null },
            sequenceNo: 0,
            clientParameters: {}
        };
        try {
            jobR = await ls.poll(currentQid, currentJob.sequenceNo, currentJob.maxWaitTime);
            if (jobR.queryStatus == "JOB_FAILED") {
                common_1.commonLogger.alert(ls, `JOB_FAILED returned. Cancelling query ${currentQid}`, 'AUTOPOLL');
                await ls.cancelPoll(currentQid, new error_1.PanCloudError(ls, "UNKNOWN", "JOB_FAILED"));
            }
            else {
                ls.eventEmitter(jobR);
                if (jobR.queryStatus == "FINISHED") {
                    currentJob.sequenceNo++;
                }
                if (jobR.queryStatus == "JOB_FINISHED") {
                    ls.emitterCleanup(jobR);
                    currentJob.resolve(jobR);
                }
            }
        }
        catch (err) {
            if (error_1.isSdkError(err)) {
                common_1.commonLogger.alert(ls, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL');
                await ls.cancelPoll(currentQid, err);
            }
            else {
                common_1.commonLogger.error(error_1.PanCloudError.fromError(ls, err));
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = timers_1.setTimeout(LoggingService.autoPoll, ls.apSleep, ls);
        }
        else {
            ls.tout = undefined;
            common_1.commonLogger.info(ls, "query autopoller de-scheduled", "AUTOPOLL");
        }
    }
    /**
     * User can use this method to cancel (remove) a query from the auto-poll queue
     * @param qid query id to be cancelled
     */
    cancelPoll(qid, err) {
        if (qid in this.jobQueue) {
            let jobToCancel = this.jobQueue[qid];
            delete this.jobQueue[qid];
            this.pendingQueries = Object.keys(this.jobQueue);
            if (this.pendingQueries.length == 0 && this.tout) {
                clearTimeout(this.tout);
                this.tout = undefined;
                this.l2CorrFlush();
            }
            if (err) {
                jobToCancel.reject(err);
            }
            else {
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
                });
            }
        }
        return this.deleteQuery(qid);
    }
    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled
     */
    deleteQuery(queryId) {
        this.stats.deletes++;
        return this.voidXOperation(`/queries/${queryId}`, undefined, "DELETE");
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
    async write(vendorName, logType, data) {
        let rJson = await this.fetchPostWrap(`/logs/${vendorName}/${logType}`, JSON.stringify(data));
        this.lastResponse = rJson;
        if (!isWriteResult(rJson)) {
            throw new error_1.PanCloudError(this, 'PARSER', `Response is not a valid LS Write Response: ${JSON.stringify(rJson)}`);
        }
        return rJson;
    }
    eventEmitter(j) {
        if (!(j.result.esResult &&
            this.pendingQueries.includes(j.queryId) &&
            j.result.esResult.hits.hits.length > 0)) {
            return;
        }
        this.eevent.source = j.queryId;
        this.eevent.logType = this.jobQueue[j.queryId].logtype;
        if (!this.eevent.logType) {
            if (j.result.esResult.hits.hits.length > 0) {
                let lType = "";
                let firstEntry = j.result.esResult.hits.hits[0];
                knownIndexes.some(p => {
                    if (firstEntry._index.includes(p)) {
                        lType = p;
                        return true;
                    }
                    return false;
                });
                lType += firstEntry._type;
                if (common_1.isKnownLogType(lType)) {
                    this.eevent.logType = lType;
                }
                else {
                    common_1.commonLogger.alert(this, `Discarding event set of unknown log type: ${lType}`, "EMITTER");
                    return;
                }
            }
            else {
                common_1.commonLogger.alert(this, `Discarding empty event set from source without known log type: ${JSON.stringify(j).substr(0, 300)}`, "EMITTER");
                return;
            }
        }
        this.eevent.message = j.result.esResult.hits.hits.map(e => e._source);
        this.emitMessage(this.eevent);
    }
    emitterCleanup(j) {
        let qid = j.queryId;
        if (this.pendingQueries.length == 1) {
            this.l2CorrFlush();
        }
        if (qid in this.jobQueue) {
            delete this.jobQueue[qid];
        }
        this.pendingQueries = Object.keys(this.jobQueue);
    }
    getLsStats() {
        return this.stats;
    }
}
exports.LoggingService = LoggingService;
