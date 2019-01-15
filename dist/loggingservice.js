"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const core_1 = require("./core");
const error_1 = require("./error");
const timers_1 = require("timers");
const MSLEEP = 200; // milliseconds to sleep between non-empty polls
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
class LoggingService extends core_1.coreClass {
    constructor(ops) {
        super(ops);
        this.url = `${this.entryPoint}/${lsPath}`;
        this.eevent = { source: 'LoggingService' };
        this.ap_sleep = MSLEEP;
        this.jobQueue = {};
        this.lastProcElement = 0;
        this.pendingQueries = [];
    }
    ;
    static factory(ops) {
        return new LoggingService(ops);
    }
    async query(cfg, eCallBack, sleep = MSLEEP, fetchTimeout) {
        this.ap_sleep = sleep;
        this.fetchTimeout = fetchTimeout;
        let cfgStr = JSON.stringify(cfg);
        let r_json = await this.fetchPostWrap(this.url, cfgStr, fetchTimeout);
        this.lastResponse = r_json;
        if (!(isJobResult(r_json))) {
            throw new error_1.PanCloudError(LoggingService, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`);
        }
        if (r_json.queryStatus != "JOB_FAILED") {
            if (eCallBack !== undefined) {
                if (eCallBack) {
                    if (!this.registerEvenetListener(eCallBack)) {
                        common_1.commonLogger.info(LoggingService, "Event receiver already registered and duplicates not allowed is set to TRUE", "RECEIVER");
                    }
                }
                let emptyQueue = this.pendingQueries.length == 0;
                let seq = 0;
                if (r_json.queryStatus == "FINISHED") {
                    seq = r_json.sequenceNo + 1;
                }
                this.jobQueue[r_json.queryId] = { logtype: cfg.logType, sequenceNo: seq, maxWaitTime: cfg.maxWaitTime };
                this.pendingQueries = Object.keys(this.jobQueue);
                this.eventEmitter(r_json);
                if (r_json.queryStatus == "JOB_FINISHED") {
                    await this.emitterCleanup(r_json);
                }
                else if (emptyQueue) {
                    LoggingService.autoPoll(this);
                }
            }
        }
        return r_json;
    }
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
        throw new error_1.PanCloudError(LoggingService, 'PARSER', `Response is not a valid LS JOB Doc: ${JSON.stringify(r_json)}`);
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
            ls.eventEmitter(jobR);
            if (jobR.queryStatus == "FINISHED") {
                currentJob.sequenceNo++;
            }
            if (jobR.queryStatus == "JOB_FINISHED") {
                await ls.emitterCleanup(jobR);
            }
        }
        catch (err) {
            if (error_1.isSdkError(err)) {
                common_1.commonLogger.alert(LoggingService, `Error triggered. Cancelling query ${currentQid}`, 'AUTOPOLL');
                ls.cancelPoll(currentQid);
                ls.emitEvent({ source: currentQid });
            }
            else {
                common_1.commonLogger.error(error_1.PanCloudError.fromError(LoggingService, err));
            }
        }
        if (ls.pendingQueries.length) {
            ls.tout = timers_1.setTimeout(LoggingService.autoPoll, ls.ap_sleep, ls);
        }
    }
    cancelPoll(qid) {
        if (qid in this.jobQueue) {
            if (this.pendingQueries.length == 1 && this.tout) {
                clearTimeout(this.tout);
                this.tout = undefined;
            }
            delete this.jobQueue[qid];
            this.pendingQueries = Object.keys(this.jobQueue);
        }
    }
    async delete_query(queryId) {
        return this.void_X_Operation(`${this.url}/${queryId}`, undefined, "DELETE");
    }
    eventEmitter(j) {
        if (!(j.result.esResult && this.pendingQueries.includes(j.queryId))) {
            return;
        }
        this.eevent.source = j.queryId;
        this.eevent.logType = this.jobQueue[j.queryId].logtype;
        if (!(this.eevent.logType) && j.result.esResult.hits.hits.length > 0) {
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
                common_1.commonLogger.alert(LoggingService, `Discarding event set of unknown log type: ${lType}`, "EMITTER");
                return;
            }
        }
        else {
            common_1.commonLogger.alert(LoggingService, `Discarding empty event set from source without known log type`, "EMITTER");
            return;
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
LoggingService.className = "LoggingService";
exports.LoggingService = LoggingService;
