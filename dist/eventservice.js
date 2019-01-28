"use strict";
/**
 * High level abstraction of the Application Framework Event Service
 */
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const core_1 = require("./core");
const error_1 = require("./error");
const timers_1 = require("timers");
/**
 * Default amount of milliseconds to wait between ES AutoPoll events
 */
const MSLEEP = 200;
const esPath = "event-service/v1/channels";
/**
 * Default Event Server {@link esPollOptions} options
 */
let DEFAULT_PO = { ack: false, pollTimeout: 1000, fetchTimeout: 45000 };
let invalidTables = ["tms.analytics", "tms.config", "tms.system", "tms.threat"];
function is_esEvent(obj) {
    if (obj && typeof obj == "object") {
        if ("logType" in obj && typeof obj.logType == "string" && common_1.isKnownLogType(obj.logType)) {
            if ("event" in obj && typeof obj.event == "object" && obj.event instanceof Array) {
                return true;
            }
        }
    }
    return false;
}
function is_esFilter(obj) {
    if (obj && typeof obj == "object") {
        if ("filters" in obj && typeof obj.filters == "object" && obj.filters instanceof Array) {
            let obj2 = obj.filters;
            return obj2.every(e => {
                if (e && typeof e == "object") {
                    let obj2_e = Object.entries(e);
                    if (obj2_e.length == 1 && typeof obj2_e[0][0] == "string" && typeof obj2_e[0][1] == "object") {
                        let obj3 = obj2_e[0][1];
                        return (typeof obj3['filter'] == "string" &&
                            ["number", "undefined"].includes(typeof obj3['timeout']) &&
                            ["number", "undefined"].includes(typeof obj3['batchSize']));
                    }
                    return false;
                }
                return false;
            });
        }
    }
    return false;
}
/**
 * High-level class that implements an Application Framework Event Service client. It supports both sync
 * and async features. Objects of this class must be obtained using the factory static method
 */
class EventService extends core_1.coreClass {
    constructor(ops) {
        super({
            credential: ops.credential,
            entryPoint: ops.entryPoint,
            allowDup: ops.allowDup,
            level: ops.level
        });
        this.className = "EventService";
        if (!ops.channelId) {
            ops.channelId = 'EventFilter';
        }
        this.setChannel(ops.channelId);
        this.popts = DEFAULT_PO;
        this.ap_sleep = MSLEEP;
        this.polling = false;
        this.eevent = { source: "EventService" };
    }
    setChannel(channelId) {
        this.filterUrl = `${this.entryPoint}/${esPath}/${channelId}/filters`;
        this.pollUrl = `${this.entryPoint}/${esPath}/${channelId}/poll`;
        this.ackUrl = `${this.entryPoint}/${esPath}/${channelId}/ack`;
        this.nackUrl = `${this.entryPoint}/${esPath}/${channelId}/nack`;
        this.flushUrl = `${this.entryPoint}/${esPath}/${channelId}/flush`;
    }
    /**
     * Static factory method to instantiate an Event Service object
     * @param esOps Instantitation configuration object accepting parameters from {@link core.coreOptions} and
     * {@link esOptions}
     * @returns an instantiated {@link EventService} object
     */
    static factory(esOps) {
        return new EventService(esOps);
    }
    /**
     * @returns the current Event Service filter configuration
     */
    async getFilters() {
        let r_json = await this.fetchGetWrap(this.filterUrl);
        this.lastResponse = r_json;
        if (is_esFilter(r_json)) {
            return r_json;
        }
        throw new error_1.PanCloudError(this, 'PARSER', `response is not a valid ES Filter: ${JSON.stringify(r_json)}`);
    }
    /**
     * Sets a new Event Service configuration
     * @param fcfg The new service configuration. If the configuration includes a valid callBack handler (currently
     * only {@link esFilterCfg.filterOptions.eventCallBack} is supported) then the class AutoPoll feature is turned on
     * @returns a promise to the current Event Service to ease promise chaining
     */
    async setFilters(fcfg) {
        this.popts = (fcfg.filterOptions.poolOptions) ? fcfg.filterOptions.poolOptions : DEFAULT_PO;
        this.ap_sleep = (fcfg.filterOptions.sleep) ? fcfg.filterOptions.sleep : MSLEEP;
        await this.void_X_Operation(this.filterUrl, JSON.stringify(fcfg.filter), 'PUT');
        if (fcfg.filterOptions.eventCallBack || fcfg.filterOptions.pcapCallBack || fcfg.filterOptions.correlationCallBack) {
            this.newEmitter(fcfg.filterOptions.eventCallBack, fcfg.filterOptions.pcapCallBack, fcfg.filterOptions.correlationCallBack);
            EventService.autoPoll(this);
        }
        else if (this.tout) {
            timers_1.clearTimeout(this.tout);
            this.tout = undefined;
        }
        return this;
    }
    /**
     * Convenience function to set a valid {@link esFilterCfg} configuration in the Event Service using a
     * description object
     * @param fbcfg The filter description object
     * @returns a promise to the current Event Service to ease promise chaining
     */
    filterBuilder(fbcfg) {
        if (fbcfg.filter.some(f => invalidTables.includes(f.table))) {
            throw new error_1.PanCloudError(this, 'CONFIG', 'PanCloudError() only "tms.traps" is accepted in the EventService');
        }
        let fcfg = {
            filter: {
                filters: fbcfg.filter.map(e => {
                    let m = {};
                    m[e.table] = { filter: `select * from \`${e.table}\`` };
                    if (e.where) {
                        m[e.table].filter += ` where ${e.where}`;
                    }
                    m[e.table].timeout = e.timeout;
                    m[e.table].batchSize = e.batchSize;
                    return m;
                })
            },
            filterOptions: fbcfg.filterOptions
        };
        if (fbcfg.flush) {
            fcfg.filter.flush = true;
        }
        return this.setFilters(fcfg);
    }
    /**
     * Sets an empty filter in the Event Service
     * @param flush Optinal `flush` attribute (defaults to `false`)
     * @returns a promise to the current Event Service to ease promise chaining
     */
    clearFilter(flush = false) {
        let fcfg = { filter: { filters: [] }, filterOptions: {} };
        if (flush) {
            fcfg.filter.flush = true;
        }
        this.pause();
        return this.setFilters(fcfg);
    }
    /**
     * Performs an `ACK` operation on the Event Service
     */
    async ack() {
        return this.void_X_Operation(this.ackUrl);
    }
    /**
     * Performs a `NACK` operation on the Event Service
     */
    async nack() {
        return this.void_X_Operation(this.nackUrl);
    }
    /**
     * Performs a `FLUSH` operation on the Event Service
     */
    async flush() {
        return this.void_X_Operation(this.flushUrl);
    }
    /**
     * Performs a `POLL` operation on the Event Service
     * @returns a promise that resolves to an array of {@link esEvent} objects
     */
    async poll() {
        let body = '{}';
        if (this.popts.pollTimeout != 1000) {
            body = JSON.stringify({ pollTimeout: this.popts.pollTimeout });
        }
        let r_json = await this.fetchPostWrap(this.pollUrl, body, this.popts.fetchTimeout);
        this.lastResponse = r_json;
        if (r_json && typeof r_json == "object" && r_json instanceof Array) {
            if (r_json.every(e => is_esEvent(e))) {
                if (this.popts.ack) {
                    await this.ack();
                }
                return r_json;
            }
        }
        throw new error_1.PanCloudError(this, 'PARSER', 'Response is not a valid ES Event array');
    }
    static async autoPoll(es) {
        es.polling = true;
        es.tout = undefined;
        let e = [];
        try {
            e = await es.poll();
            e.forEach(i => {
                es.eevent.logType = i.logType;
                es.eevent.event = i.event;
                es.emitEvent(es.eevent);
            });
        }
        catch (err) {
            common_1.commonLogger.error(error_1.PanCloudError.fromError(es, err));
        }
        if (es.polling) {
            if (e.length) {
                setImmediate(EventService.autoPoll, es);
            }
            else {
                es.tout = timers_1.setTimeout(EventService.autoPoll, es.ap_sleep, es);
            }
        }
    }
    /**
     * Stops this class AutoPoll feature for this Event Service instance
     */
    pause() {
        this.polling = false;
        if (this.tout) {
            timers_1.clearTimeout(this.tout);
            this.tout = undefined;
        }
    }
    /**
     * (Re)Starts the AutoPoll feature for this Event Service instance. Typically the user won't start the
     * AutoPoll feature using this method but providing a valid callback in the {@link filterOptions} when calling
     * the method {@link EventService.setFilters}
     */
    resume() {
        EventService.autoPoll(this);
    }
}
exports.EventService = EventService;
