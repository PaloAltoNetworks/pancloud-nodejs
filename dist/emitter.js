"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const core_1 = require("./core");
const error_1 = require("./error");
const l2correlator_1 = require("./l2correlator");
const events_1 = require("events");
const util_1 = require("./util");
const EVENT_EVENT = 'EVENT_EVENT';
const PCAP_EVENT = 'PCAP_EVENT';
const CORR_EVENT = 'CORR_EVENT';
class Emitter extends core_1.CoreClass {
    constructor(baseUrl, ops) {
        super(baseUrl, ops);
        this.className = "emitterClass";
        this.allowDupReceiver = (ops.allowDup == undefined) ? false : ops.allowDup;
        this.newEmitter();
        if (ops.level != undefined && ops.level != common_1.LogLevel.INFO) {
            common_1.commonLogger.level = ops.level;
        }
        this.stats = Object.assign({ correlationEmitted: 0, eventsEmitted: 0, pcapsEmitted: 0 }, this.stats);
        if (ops.l2Corr) {
            this.l2enable = true;
            this.l2engine = new l2correlator_1.MacCorrelator(ops.l2Corr.timeWindow, ops.l2Corr.absoluteTime, ops.l2Corr.gcMultiplier);
            this.stats.correlationStats = this.l2engine.stats;
        }
        else {
            this.l2enable = false;
        }
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
     * Registers a client to the **EVENT_EVENT** topic
     * @param listener function that will be provided to the **EventEmitter.on()** method and that will
     * receive events comming from the Application Framework
     * @returns the value _true_ if the listener is indeed registered. _false_ in case the
     * listener has already been registered and the factory option **allowDupReceiver** was
     * not set to _true_
     */
    registerEventListener(listener) {
        return this.registerListener(EVENT_EVENT, listener);
    }
    /**
     * Unregisters the listener from the **EVENT_EVENT** topic
     * @param listener
     */
    unregisterEventListener(listener) {
        this.unregisterListener(EVENT_EVENT, listener);
    }
    /**
     * Registers a client to the **PCAP_EVENT** topic
     * @param listener function that will be provided to the **EventEmitter.on()** method and that will
     * receive *Buffer* instances containing a valid _libPcap_ file body for each received record
     * containing a valid value in the _pcap_ property.
     * @returns the value _true_ if the listener is indeed registered. _false_ in case the
     * listener has already been registered and the factory option **allowDupReceiver** was
     * not set to _true_
     */
    registerPcapListener(listener) {
        return this.registerListener(PCAP_EVENT, listener);
    }
    /**
     * Unregisters the listener from the **PCAP_EVENT** topic
     * @param listener
     */
    unregisterPcapListener(listener) {
        this.unregisterListener(PCAP_EVENT, listener);
    }
    /**
     * Registers a client to the **CORR_EVENT** topic
     * @param listener function that will be provided to the **EventEmitter.on()** method and that will
     * receive **L2correlation** instances containing a valid _libPcap_ file body for each received record
     * containing a valid value in the _pcap_ property.
     * @returns the value _true_ if the listener is indeed registered. _false_ in case the
     * listener has already been registered and the factory option **allowDupReceiver** was
     * not set to _true_
     */
    registerCorrListener(listener) {
        return this.registerListener(CORR_EVENT, listener);
    }
    /**
     * Unregisters the listener from the **PCAP_EVENT** topic
     * @param listener
     */
    unregisterCorrListener(listener) {
        this.unregisterListener(CORR_EVENT, listener);
    }
    newEmitter(ee, pe, ce) {
        this.emitter = new events_1.EventEmitter();
        this.emitter.on('error', (err) => {
            common_1.commonLogger.error(error_1.PanCloudError.fromError(this, err));
        });
        this.notifier = { EVENT_EVEN: false, PCAP_EVENT: false, CORRELATION_EVENT: false };
        if (ee) {
            this.registerEventListener(ee);
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
                let pcapBody = util_1.Util.pcaptize(x);
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
}
exports.Emitter = Emitter;
