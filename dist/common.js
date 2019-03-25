"use strict";
// Copyright 2015-2019 Palo Alto Networks, Inc
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Provides common resources for other modules in the pancloud SDK
 */
const error_1 = require("./error");
const crypto_1 = require("crypto");
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["ALERT"] = 2] = "ALERT";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
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
exports.region2EntryPoint = {
    'americas': 'https://api.us.paloaltonetworks.com',
    'europe': 'https://api.eu.paloaltonetworks.com'
};
function isKnownLogType(t) {
    return LTYPES.hasOwnProperty(t);
}
exports.isKnownLogType = isKnownLogType;
/**
 * Centralized logging capability for the whole pancloud SDK
 */
class SdkLogger {
    /**
     *
     * @param level only messages with a level equal or avobe this provided value will be loogged
     * @param stackTrace boolean value to toggle stacktrace logging
     */
    constructor(level, stackTrace = true) {
        this.level = level;
        this.stackTrace = stackTrace;
    }
    error(e) {
        this.format(e.getSourceClass(), e.getErrorMessage(), LogLevel.ERROR, e.name, e.getErrorCode(), undefined, e.stack);
    }
    alert(source, message, name) {
        this.format(source.className, message, LogLevel.ALERT, name);
    }
    info(source, message, name) {
        this.format(source.className, message, LogLevel.INFO, name);
    }
    debug(source, message, name, payload) {
        this.format(source.className, message, LogLevel.DEBUG, name, undefined, payload);
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
                    if (jsonText.length > 300) {
                        payloadOut = jsonText.substr(0, 300) + ' ...';
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
                case LogLevel.ERROR: {
                    console.error(finalOutput);
                    break;
                }
                case LogLevel.ALERT:
                case LogLevel.INFO: {
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
/**
 * Instantiate a module-provided logger at load time
 */
exports.commonLogger = new SdkLogger(LogLevel.INFO, false);
/**
 * Developer might decide to change the loglevel of the logger object at runtime
 * @param newLevel the new log level
 */
function setLogLevel(newLevel) {
    exports.commonLogger.level = newLevel;
}
exports.setLogLevel = setLogLevel;
/**
 * Changes the common logger variable to a user-provided object
 * @param logger user provided pancloudLogger compliant object to be used for SDK logging
 */
function setLogger(logger) {
    exports.commonLogger = logger;
}
exports.setLogger = setLogger;
/**
 * Abstract function used to retry multiple times a user-provided operation
 * @param source class using the retrier. Its className property value will be used in logs generated by the retrier
 * @param n number of attempts
 * @param delay milliseconds to wait after a failed attempt
 * @param handler function that implements the operation
 * @param params additional arguments to be passed to the handler function
 */
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
function expTokenExtractor(source, token) {
    let parts = token.split('.');
    if (parts.length != 3) {
        throw new error_1.PanCloudError(source, 'PARSER', 'Not a valid JWT token format');
    }
    let expAttribute;
    try {
        expAttribute = JSON.parse(Buffer.from(parts[1], 'base64').toString()).exp;
    }
    catch (_a) {
        throw new error_1.PanCloudError(source, 'PARSER', 'Not a valid JWT token format');
    }
    if (typeof expAttribute == 'number') {
        return expAttribute;
    }
    throw new error_1.PanCloudError(source, 'PARSER', 'JWT token does not have a valid "exp" field');
}
exports.expTokenExtractor = expTokenExtractor;
function uid() {
    let data = `pancloud${Date.now()}nodejs`;
    return crypto_1.createHash('sha1').update(data).digest('base64');
}
exports.uid = uid;
