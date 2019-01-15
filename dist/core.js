"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fetch = require("node-fetch");
const error_1 = require("./error");
const events_1 = require("events");
const common_1 = require("./common");
const EVENT_EVENT = 'EVENT_EVENT';
const PCAP_EVENT = 'PCAP_EVENT';
const CORRELATION_EVENT = 'CORRELATION_EVENT';
class coreClass {
    constructor(ops) {
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
    registerEvenetListener(l) {
        return this.registerListener(EVENT_EVENT, l);
    }
    unregisterEvenetListener(l) {
        this.unregisterListener(EVENT_EVENT, l);
    }
    registerCorrelationListener(l) {
        return this.registerListener(CORRELATION_EVENT, l);
    }
    unregisterCorrelationListener(l) {
        this.unregisterListener(CORRELATION_EVENT, l);
    }
    registerPcapListener(l) {
        return this.registerListener(PCAP_EVENT, l);
    }
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
    emitEvent(e) {
        if (this.notifier[EVENT_EVENT]) {
            if (!(e.event)) {
            }
            this.emitter.emit(EVENT_EVENT, e);
        }
    }
    setFetchHeaders() {
        this.fetchHeaders = {
            'Authorization': 'Bearer ' + this.cred.get_access_token(),
            'Content-Type': 'application/json'
        };
        common_1.commonLogger.info(coreClass, 'updated authorization header');
    }
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
        common_1.commonLogger.debug(coreClass, `fetch operation to ${url}`, method, body);
        let r = await common_1.retrier(coreClass, undefined, undefined, fetch.default, url, rinit);
        let r_text = await r.text();
        if (r_text.length == 0) {
            common_1.commonLogger.info(coreClass, 'fetch response is null');
            return null;
        }
        let r_json;
        try {
            r_json = JSON.parse(r_text);
        }
        catch (exception) {
            throw new error_1.PanCloudError(coreClass, 'PARSER', `Invalid JSON: ${exception.message}`);
        }
        if (!r.ok) {
            throw new error_1.ApplicationFrameworkError(coreClass, r_json);
        }
        common_1.commonLogger.debug(coreClass, 'fetch response', undefined, r_json);
        return r_json;
    }
    async fetchGetWrap(url, timeout) {
        return await this.fetchXWrap(url, "GET", undefined, timeout);
    }
    async fetchPostWrap(url, body, timeout) {
        return await this.fetchXWrap(url, "POST", body, timeout);
    }
    async fetchPutWrap(url, body, timeout) {
        return await this.fetchXWrap(url, "PUT", body, timeout);
    }
    async fetchDeleteWrap(url, timeout) {
        return await this.fetchXWrap(url, "DELETE", undefined, timeout);
    }
    async void_X_Operation(url, payload, method = "POST") {
        let r_json = await this.fetchXWrap(url, method, payload);
        this.lastResponse = r_json;
    }
}
coreClass.className = "coreClass";
exports.coreClass = coreClass;
