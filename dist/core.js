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
const EVENT_EVENT = 'EVENT_EVENT';
const PCAP_EVENT = 'PCAP_EVENT';
const CORRELATION_EVENT = 'CORRELATION_EVENT';
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
    registerCorrelationListener(l) {
        return this.registerListener(CORRELATION_EVENT, l);
    }
    /**
     * @ignore To Be Implemented
     */
    unregisterCorrelationListener(l) {
        this.unregisterListener(CORRELATION_EVENT, l);
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
    unregisterPcapListener(l) {
        this.unregisterListener(PCAP_EVENT, l);
    }
    newEmitter(ee, pe, ce) {
        this.emitter = new events_1.EventEmitter();
        this.notifier = { EVENT_EVEN: false, PCAP_EVENT: false, CORRELATION_EVENT: false };
        if (ee) {
            this.registerEvenetListener(ee);
        }
        if (pe) {
            this.registerPcapListener(pe);
        }
        if (ce) {
            this.registerCorrelationListener(ce);
        }
    }
    /**
     * Used to send an event to all subscribers in the 'event' topic
     * @param e the event to be sent
     */
    emitEvent(e) {
        if (this.notifier[EVENT_EVENT]) {
            if (!(e.event)) {
            }
            this.emitter.emit(EVENT_EVENT, e);
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
        let r = await common_1.retrier(this, undefined, undefined, fetch.default, url, rinit);
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
}
exports.coreClass = coreClass;
