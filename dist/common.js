"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var logLevel;
(function (logLevel) {
    logLevel[logLevel["DEBUG"] = 0] = "DEBUG";
    logLevel[logLevel["INFO"] = 1] = "INFO";
    logLevel[logLevel["ALERT"] = 2] = "ALERT";
    logLevel[logLevel["ERROR"] = 3] = "ERROR";
})(logLevel = exports.logLevel || (exports.logLevel = {}));
const LTYPES = {
    "panw.auth": "",
    "panw.config": "",
    "panw.dpi": "",
    "panw.dpi_hipreport": "",
    "panw.dpi_stats": "",
    "panw.gtp": "",
    "panw.gtpsum": "",
    "panw.hipmatch": "",
    "panw.sctp": "",
    "panw.sctpsum": "",
    "panw.system": "",
    "panw.threat": "",
    "panw.thsum": "",
    "panw.traffic": "",
    "panw.trsum": "",
    "panw.urlsum": "",
    "panw.userid": "",
    "tms.analytics": "",
    "tms.config": "",
    "tms.system": "",
    "tms.threat": "",
    "tms.traps": ""
};
function isKnownLogType(t) {
    return LTYPES.hasOwnProperty(t);
}
exports.isKnownLogType = isKnownLogType;
class sdkLogger {
    constructor(level, stackTrace = true) {
        this.level = level;
        this.stackTrace = stackTrace;
    }
    error(e) {
        this.format(e.getSourceClass(), e.getErrorMessage(), logLevel.ERROR, e.name, e.getErrorCode(), undefined, e.stack);
    }
    alert(source, message, name) {
        this.format(source.className, message, logLevel.ALERT, name);
    }
    info(source, message, name) {
        this.format(source.className, message, logLevel.INFO, name);
    }
    debug(source, message, name, payload) {
        this.format(source.className, message, logLevel.DEBUG, name, undefined, payload);
    }
    format(source, message, level, name, code, payload, stack) {
        if (level >= this.level) {
            let output = {
                source,
                message
            };
            let payloadOut = '';
            if (name) {
                output['name'] = name;
            }
            if (code) {
                output['code'] = code;
            }
            if (stack) {
                output['stack'] = stack;
            }
            if (payload) {
                if (typeof payload == 'string') {
                    payloadOut = payload;
                }
                else {
                    let jsonText = JSON.stringify(payload);
                    if (jsonText.length > 256) {
                        payloadOut = jsonText.substr(0, 256) + ' ...';
                    }
                    else {
                        payloadOut = jsonText;
                    }
                }
            }
            let finalOutput = `PANCLOUD: ${JSON.stringify(output)}`;
            if (payloadOut != '') {
                finalOutput += ` payload=${payloadOut}`;
            }
            switch (level) {
                case logLevel.ERROR: {
                    console.error(finalOutput);
                    break;
                }
                case logLevel.ALERT:
                case logLevel.INFO: {
                    console.info(finalOutput);
                    break;
                }
                default: {
                    console.info(finalOutput);
                }
            }
            if (this.stackTrace && stack) {
                console.error(stack);
            }
        }
    }
}
exports.commonLogger = new sdkLogger(logLevel.INFO, false);
function setLogLevel(newLevel) {
    exports.commonLogger.level = newLevel;
}
exports.setLogLevel = setLogLevel;
function setLogger(logger) {
    exports.commonLogger = logger;
}
exports.setLogger = setLogger;
async function retrier(source, n = 3, delay = 100, handler, ...params) {
    let a = n;
    let lastError = undefined;
    while (a > 0) {
        try {
            return await handler(...params);
        }
        catch (e) {
            exports.commonLogger.info(source, `Failed attempt ${a}`, 'RETRIER');
            lastError = e;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, delay);
        });
        a--;
    }
    throw (lastError) ? lastError : new Error('reties exhausted');
}
exports.retrier = retrier;
