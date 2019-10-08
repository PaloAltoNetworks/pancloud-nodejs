"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_1 = require("./error");
const stream_1 = require("stream");
const common_1 = require("./common");
const RETRIES = 20;
const DELAY = 200;
var readableStates;
(function (readableStates) {
    readableStates[readableStates["READY"] = 0] = "READY";
    readableStates[readableStates["LOADING"] = 1] = "LOADING";
    readableStates[readableStates["CLOSING"] = 2] = "CLOSING";
    readableStates[readableStates["CLOSED"] = 3] = "CLOSED";
})(readableStates || (readableStates = {}));
class LoggingServiceClient extends stream_1.Readable {
    constructor(ls, cfg, opts) {
        super(Object.assign({}, opts, { objectMode: true }));
        this.init = false;
        this.retries = RETRIES;
        this.delay = DELAY;
        this.state = readableStates.READY;
        this.sequence = 0;
        this.pusher = async () => {
            const data = (this.jr.result.esResult === undefined) ? [] : this.jr.result.esResult.hits.hits.map(x => x._source);
            if (this.jr.queryStatus == 'JOB_FINISHED' || this.jr.queryStatus == 'CANCELLED' || this.jr.queryStatus == 'JOB_FAILED') {
                this.state = readableStates.CLOSING;
                this.push(data);
                return;
            }
            this.state = readableStates.LOADING;
            // safety check: queryStatus can only be 'FINISHED' at this point
            if (this.jr.queryStatus != 'FINISHED') {
                common_1.commonLogger.alert(LoggingServiceClient, `Only jobStatus = "FINISHED" expected at this point. It was "${this.jr.queryStatus}" instead`);
                throw new error_1.PanCloudError(LoggingServiceClient, 'UNKNOWN', `Only jobStatus = "FINISHED" expected at this point. It was "${this.jr.queryStatus}" instead`);
            }
            this.sequence++;
            try {
                this.jr = await (this.ls.poll(this.jr.queryId, this.sequence));
            }
            catch (e) {
                this.destroy(e);
            }
            let attempts = 0;
            while (this.jr.queryStatus == 'RUNNING' && attempts++ < this.retries) {
                this.jr = await new Promise((res, rej) => setTimeout(async () => {
                    try {
                        res(await this.ls.poll(this.jr.queryId, this.sequence));
                    }
                    catch (e) {
                        rej(e);
                    }
                }, this.delay));
            }
            if (attempts >= this.retries) {
                common_1.commonLogger.alert(LoggingServiceClient, `Still in ${this.jr.queryStatus} state after ${attempts} attempts`, 'LazyInit');
                await this.ls.deleteQuery(this.jr.queryId);
                throw new error_1.PanCloudError(LoggingServiceClient, 'UNKNOWN', `Still in ${this.jr.queryStatus} state after ${attempts} attempts`);
            }
            if (this.push(data))
                process.nextTick(this.pusher);
            else
                this.state = readableStates.READY;
        };
        this.ls = ls;
        this.cfg = Object.assign({}, cfg);
        delete this.cfg.callBack;
        if (cfg.retries !== undefined) {
            this.retries = cfg.retries;
        }
        if (cfg.delay !== undefined) {
            this.delay = cfg.delay;
        }
    }
    async lazyInit() {
        if (!this.init) {
            this.jr = await this.ls.query(this.cfg);
            let attempts = 0;
            while (this.jr.queryStatus == 'RUNNING' && attempts++ < this.retries) {
                this.jr = await new Promise((res, rej) => setTimeout(async () => {
                    try {
                        res(await this.ls.poll(this.jr.queryId, 0));
                    }
                    catch (e) {
                        rej(e);
                    }
                }, this.delay));
            }
            if (attempts >= this.retries) {
                common_1.commonLogger.alert(LoggingServiceClient, `Still in ${this.jr.queryStatus} state after ${attempts} attempts`, 'LazyInit');
                await this.ls.deleteQuery(this.jr.queryId);
                throw new error_1.PanCloudError(LoggingServiceClient, 'UNKNOWN', `Still in ${this.jr.queryStatus} state after ${attempts} attempts`);
            }
            if (this.jr.queryStatus == 'JOB_FAILED') {
                common_1.commonLogger.alert(LoggingServiceClient, 'Job Failed', 'LazyInit');
                throw new error_1.PanCloudError(LoggingServiceClient, 'UNKNOWN', 'Job Failed');
            }
        }
        this.init = true;
    }
    _read() {
        this.lazyInit().then(() => {
            switch (this.state) {
                case readableStates.READY:
                    process.nextTick(this.pusher);
                    break;
                case readableStates.CLOSING:
                    this.state = readableStates.CLOSED;
                    this.push(null);
            }
        }).catch(e => process.nextTick(() => this.emit('error', e)));
    }
    _destroy(error, callback) {
        if (this.jr === undefined)
            callback(null);
        else
            this.ls.deleteQuery(this.jr.queryId).then(() => callback(null), e => callback(e));
    }
}
LoggingServiceClient.className = "LoggingServiceClient";
exports.LoggingServiceClient = LoggingServiceClient;
