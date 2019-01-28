"use strict";
/**
 * High level abstraction of the Application Framework Logging Service
 */
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const core_1 = require("./core");
const error_1 = require("./error");
const timers_1 = require("timers");
/**
 * Default delay (in milliseconds) between successive polls (auto-poll feature). It can be overrided in the
 * function signature
 */
const MSLEEP = 200;
const lsPath = "logging-service/v1/queries";
const jStatus = {
    'RUNNING': '', 'FINISHED': '', 'JOB_FINISHED': '', 'JOB_FAILED': ''
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
/**
 * High-level class that implements an Application Framework Logging Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
class LoggingService extends core_1.coreClass {
    constructor(ops) {
        super(ops);
        this.className = "LoggingService";
        this.url = `${this.entryPoint}/${lsPath}`;
        this.eevent = { source: 'LoggingService' };
        this.ap_sleep = MSLEEP;
        this.jobQueue = {};
        this.lastProcElement = 0;
        this.pendingQueries = [];
    }
    ;
    /**
     * Logging Service object factory method
     * @param ops configuration object for the instance to be created
     * @returns a new Logging Service instance object with the provided configuration
     */
    static factory(ops) {
        return new LoggingService(ops);
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
    async query(cfg, eCallBack, sleep, fetchTimeout) {
        if (sleep) {
            this.ap_sleep = sleep;
        }
        this.fetchTimeout = fetchTimeout;
        let providedLogType = cfg.logType;
        delete cfg.logType;
        let cfgStr = JSON.stringify(cfg);
        let r_json = await this.fetchPostWrap(this.url, cfgStr, fetchTimeout);
        this.lastResponse = r_json;
        if (!(isJobResult(r_json))) {
            throw new error_1.PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`);
        }
        if (r_json.queryStatus != "JOB_FAILED") {
            if (eCallBack !== undefined) {
                if (eCallBack) {
                    if (!this.registerEvenetListener(eCallBack)) {
                        common_1.commonLogger.info(this, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER");
                    }
                }
                let seq = 0;
                this.jobQueue[r_json.queryId] = { logtype: providedLogType, sequenceNo: seq, maxWaitTime: cfg.maxWaitTime };
                this.pendingQueries = Object.keys(this.jobQueue);
                this.eventEmitter(r_json);
                if (r_json.queryStatus == "JOB_FINISHED") {
                    await this.emitterCleanup(r_json);
                }
                if (r_json.queryStatus == "FINISHED") {
                    seq = r_json.sequenceNo + 1;
                }
                if (this.pendingQueries.length > 0 && this.tout === undefined) {
                    this.tout = timers_1.setTimeout(LoggingService.autoPoll, this.ap_sleep, this);
                    common_1.commonLogger.info(this, "query autopoller scheduled", "QUERY");
                }
            }
        }
        return r_json;
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
        let targetUrl = `${this.url}/${qid}/${sequenceNo}`;
        if (maxWaitTime && maxWaitTime > 0) {
            targetUrl += `?maxWaitTime=${maxWaitTime}`;
        }
        let r_json = await this.fetchGetWrap(targetUrl, this.fetchTimeout);
        this.lastResponse = r_json;
        if (isJobResult(r_json)) {
            return r_json;
        }
        throw new error_1.PanCloudError(this, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`);
    }
    static async autoPoll(ls) {
        ls.lastProcElement++;
        if (ls.lastProcElement >= ls.pendingQueries.length) {
            ls.lastProcElement = 0;
        }
        let currentQid = ls.pendingQueries[ls.lastProcElement];
        let currentJob = ls.jobQueue[currentQid];
        let jobR = { queryId: "", queryStatus: "RUNNING", result: { esResult: null }, sequenceNo: 0 };
        try {
            jobR = await ls.poll(currentQid, currentJob.sequenceNo, currentJob.maxWaitTime);
            if (jobR.queryStatus == "JOB_FAILED") {
                common_1.commonLogger.alert(ls, `JOB_FAILED returned. Cancelling query ${currentQid}`, 'AUTOPOLL');
                ls.cancelPoll(currentQid);
            }
            else {
                ls.eventEmitter(jobR);
                if (jobR.queryStatus == "FINISHED") {
                    currentJob.sequenceNo++;
                }
                if (jobR.queryStatus == "JOB_FINISHED") {
                    await ls.emitterCleanup(jobR);
                }
            }
        }
        catch (err) {
            if (error_1.isSdkError(err)) {
                common_1.commonLogger.error(err);
                common_1.commonLogger.alert(ls, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL');
                ls.cancelPoll(currentQid);
            }
            else {
                common_1.commonLogger.error(error_1.PanCloudError.fromError(ls, err));
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = timers_1.setTimeout(LoggingService.autoPoll, ls.ap_sleep, ls);
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
    cancelPoll(qid) {
        if (qid in this.jobQueue) {
            if (this.pendingQueries.length == 1 && this.tout) {
                clearTimeout(this.tout);
                this.tout = undefined;
                common_1.commonLogger.info(this, "query autopoller de-scheduled", "AUTOPOLL");
            }
            delete this.jobQueue[qid];
            this.pendingQueries = Object.keys(this.jobQueue);
            this.emitEvent({ source: qid });
        }
    }
    /**
     * Use this method to cancel a running query
     * @param qid the query id to be cancelled
     */
    async delete_query(queryId) {
        return this.void_X_Operation(`${this.url}/${queryId}`, undefined, "DELETE");
    }
    eventEmitter(j) {
        if (!(j.result.esResult && this.pendingQueries.includes(j.queryId))) {
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
        this.eevent.event = j.result.esResult.hits.hits.map(e => e._source);
        this.emitEvent(this.eevent);
    }
    emitterCleanup(j) {
        let qid = j.queryId;
        this.emitEvent({ source: qid });
        if (qid in this.jobQueue) {
            delete this.jobQueue[qid];
        }
        this.pendingQueries = Object.keys(this.jobQueue);
        return this.delete_query(qid);
    }
}
exports.LoggingService = LoggingService;
