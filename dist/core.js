"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Implements the abstract coreClass that implements common methods for higher-end classes like Event Service
 * and Logging Service
 */
const fetch = require("node-fetch");
const error_1 = require("./error");
const events_1 = require("events");
const common_1 = require("./common");
const util_1 = require("./util");
const l2correlator_1 = require("./l2correlator");
const EVENT_EVENT = 'EVENT_EVENT';
const PCAP_EVENT = 'PCAP_EVENT';
const CORR_EVENT = 'CORR_EVENT';
/**
 * This class should not be used directly. It is meant to be extended. Use higher-level classes like LoggingService
 * or EventService
 */
class coreClass {
    /**
     *
     * @param ops configuration options for this instance
     */
    constructor(ops) {
        this.className = "coreClass";
        this.cred = ops.credential;
        this.entryPoint = ops.entryPoint;
        this.allowDupReceiver = (ops.allowDup == undefined) ? false : ops.allowDup;
        this.newEmitter();
        if (ops.level != undefined && ops.level != common_1.logLevel.INFO) {
            common_1.commonLogger.level = ops.level;
        }
        if (ops.autoRefresh == undefined) {
            this.autoR = true;
        }
        else {
            this.autoR = ops.autoRefresh;
        }
        this.retrierCount = ops.retrierCount;
        this.retrierDelay = ops.retrierDelay;
        this.stats = {
            apiTransactions: 0,
            correlationEmitted: 0,
            eventsEmitted: 0,
            pcapsEmitted: 0
        };
        if (ops.l2Corr) {
            this.l2enable = true;
            this.l2engine = new l2correlator_1.macCorrelator(ops.l2Corr.timeWindow, ops.l2Corr.absoluteTime, ops.l2Corr.gcMultiplier);
        }
        else {
            this.l2enable = false;
        }
        this.setFetchHeaders();
    }
    registerListener(event, l) {
        if (this.allowDupReceiver || !this.emitter.listeners(event).includes(l)) {
            this.emitter.on(event, l);
            this.notifier[event] = true;
            return true;
        }
        return false;
    }
    unregisterListener(event, l) {
        this.emitter.removeListener(event, l);
        this.notifier[event] = (this.emitter.listenerCount(event) > 0);
    }
    /**
     * Register new listeners to the 'event' topic. Enforces listener duplicate check
     * @param l listener
     * @returns true is the listener is accepted. False otherwise (duplicated?)
     */
    registerEvenetListener(l) {
        return this.registerListener(EVENT_EVENT, l);
    }
    /**
     * Unregisters a listener from the 'event' topic.
     * @param l listener
     */
    unregisterEvenetListener(l) {
        this.unregisterListener(EVENT_EVENT, l);
    }
    /**
     * @ignore To Be Implemented
     */
    registerPcapListener(l) {
        return this.registerListener(PCAP_EVENT, l);
    }
    /**
     * @ignore To Be Implemented
     */
    unregisterCorrListener(l) {
        this.unregisterListener(CORR_EVENT, l);
    }
    /**
     * @ignore To Be Implemented
     */
    registerCorrListener(l) {
        return this.registerListener(CORR_EVENT, l);
    }
    /**
     * @ignore To Be Implemented
     */
    unregisterPcapListener(l) {
        this.unregisterListener(PCAP_EVENT, l);
    }
    newEmitter(ee, pe, ce) {
        this.emitter = new events_1.EventEmitter();
        this.emitter.on('error', (err) => {
            common_1.commonLogger.error(error_1.PanCloudError.fromError(this, err));
        });
        this.notifier = { EVENT_EVEN: false, PCAP_EVENT: false, CORRELATION_EVENT: false };
        if (ee) {
            this.registerEvenetListener(ee);
        }
        if (pe) {
            this.registerPcapListener(pe);
        }
        if (ce) {
            this.registerCorrListener(ce);
        }
    }
    emitMessage(e) {
        if (this.notifier[PCAP_EVENT]) {
            this.emitPcap(e);
        }
        let epkg = [e];
        let correlated;
        if (this.l2enable) {
            ({ plain: epkg, correlated } = this.l2engine.process(e));
            if (this.notifier[CORR_EVENT] && correlated) {
                this.emitCorr(correlated);
            }
        }
        if (this.notifier[EVENT_EVENT]) {
            if (correlated) {
                this.emitEvent(correlated);
            }
            epkg.forEach(x => this.emitEvent(x));
        }
    }
    /**
     * Used to send an event to all subscribers in the 'event' topic
     * @param e the event to be sent
     */
    emitEvent(e) {
        if (e.message) {
            this.stats.eventsEmitted += e.message.length;
        }
        this.emitter.emit(EVENT_EVENT, e);
    }
    emitPcap(e) {
        let message = {
            source: e.source,
        };
        if (e.message) {
            e.message.forEach(x => {
                let pcapBody = util_1.util.pcaptize(x);
                if (pcapBody) {
                    this.stats.pcapsEmitted++;
                    message.message = pcapBody;
                    this.emitter.emit(PCAP_EVENT, message);
                }
            });
        }
        else {
            this.emitter.emit(PCAP_EVENT, message);
        }
    }
    emitCorr(e) {
        if (e.message) {
            this.stats.correlationEmitted += e.message.length;
        }
        if (e.message) {
            this.emitter.emit(CORR_EVENT, {
                source: e.source,
                logType: e.logType,
                message: e.message.map(x => ({
                    time_generated: x.time_generated,
                    sessionid: x.sessionid,
                    src: x.src,
                    dst: x.src,
                    "extended-traffic-log-mac": x["extended-traffic-log-mac"],
                    "extended-traffic-log-mac-stc": x["extended-traffic-log-mac-stc"]
                }))
            });
        }
    }
    l2CorrFlush() {
        if (this.l2enable) {
            let { plain } = this.l2engine.flush();
            if (this.notifier[EVENT_EVENT]) {
                plain.forEach(x => this.emitEvent(x));
            }
            common_1.commonLogger.info(this, "Flushed the L3/L2 Correlation engine DB", "CORRELATION");
        }
    }
    /**
     * Prepares the HTTP headers. Mainly used to keep the Autorization header (bearer access-token)
     */
    setFetchHeaders() {
        this.fetchHeaders = {
            'Authorization': 'Bearer ' + this.cred.get_access_token(),
            'Content-Type': 'application/json'
        };
        common_1.commonLogger.info(this, 'updated authorization header');
    }
    /**
     * Triggers the credential object access-token refresh procedure and updates the HTTP headers
     */
    async refresh() {
        await this.cred.refresh_access_token();
        this.setFetchHeaders();
    }
    async checkAutoRefresh() {
        if (this.autoR) {
            if (await this.cred.autoRefresh()) {
                this.setFetchHeaders();
            }
        }
    }
    async fetchXWrap(url, method, body, timeout) {
        this.stats.apiTransactions++;
        await this.checkAutoRefresh();
        let rinit = {
            headers: this.fetchHeaders,
            method: method
        };
        if (timeout) {
            rinit.timeout = timeout;
        }
        if (body) {
            rinit.body = body;
        }
        common_1.commonLogger.debug(this, `fetch operation to ${url}`, method, body);
        let r = await common_1.retrier(this, this.retrierCount, this.retrierDelay, fetch.default, url, rinit);
        let r_text = await r.text();
        if (r_text.length == 0) {
            common_1.commonLogger.info(this, 'fetch response is null');
            return null;
        }
        let r_json;
        try {
            r_json = JSON.parse(r_text);
        }
        catch (exception) {
            throw new error_1.PanCloudError(this, 'PARSER', `Invalid JSON: ${exception.message}`);
        }
        if (!r.ok) {
            common_1.commonLogger.alert(this, r_text, "FETCHXWRAP");
            throw new error_1.ApplicationFrameworkError(this, r_json);
        }
        common_1.commonLogger.debug(this, 'fetch response', undefined, r_json);
        return r_json;
    }
    /**
     * Convenience method that abstracts a GET operation to the Application Framework. Captures both non JSON responses
     * as well as Application Framework errors (non-200) throwing exceptions in both cases.
     * @param url URL to be called
     * @param timeout milliseconds before issuing a timeout exeception. The operation is wrapped by a 'retrier'
     * that will retry the operation. User can change default retry parameters (3 times / 100 ms) using the right
     * class configuration properties
     * @returns the object returned by the Application Framework
     */
    async fetchGetWrap(url, timeout) {
        return await this.fetchXWrap(url, "GET", undefined, timeout);
    }
    /**
     * Convenience method that abstracts a POST operation to the Application Framework
     */
    async fetchPostWrap(url, body, timeout) {
        return await this.fetchXWrap(url, "POST", body, timeout);
    }
    /**
     * Convenience method that abstracts a PUT operation to the Application Framework
     */
    async fetchPutWrap(url, body, timeout) {
        return await this.fetchXWrap(url, "PUT", body, timeout);
    }
    /**
     * Convenience method that abstracts a DELETE operation to the Application Framework
     */
    async fetchDeleteWrap(url, timeout) {
        return await this.fetchXWrap(url, "DELETE", undefined, timeout);
    }
    /**
     * Convenience method that abstracts a DELETE operation to the Application Framework
     */
    async void_X_Operation(url, payload, method = "POST") {
        let r_json = await this.fetchXWrap(url, method, payload);
        this.lastResponse = r_json;
    }
    getCoreStats() {
        if (this.l2enable) {
            return Object.assign({}, this.stats, { correlationStats: this.l2engine.getStats() });
        }
        return this.stats;
    }
}
exports.coreClass = coreClass;
