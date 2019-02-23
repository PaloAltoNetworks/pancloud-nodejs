/**
 * Provides common resources for other modules in the pancloud SDK
 */

import { sdkErr } from './error'

/**
 * A pancloud class must provide a className property that will be used to format its log messages
 */
export interface pancloudClass {
    className: string
}

export enum logLevel {
    DEBUG = 0,
    INFO = 1,
    ALERT = 2,
    ERROR = 3,
}

/**
 * User-provided logger classes are supported as long as they adhere to this interface
 */
export interface pancloudLogger {
    level: logLevel,
    error(e: sdkErr): void,
    alert(source: pancloudClass, message: string, name?: string): void,
    info(source: pancloudClass, message: string, name?: string): void,
    debug(source: pancloudClass, message: string, name?: string, payload?: any): void
}

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
}

/**
 * Convenience type to guide the developer using the right entry points
 */
export type ENTRYPOINT = 'https://api.eu.paloaltonetworks.com' | 'https://api.us.paloaltonetworks.com'

/**
 * Convenience type to guide the developer using the right paths
 */
export type PATH = "event-service/v1/channels" | "logging-service/v1/queries" | "directory-sync-service/v1"

/**
 * Convenience type to guide the developer using the common log types
 */
export type LOGTYPE = keyof typeof LTYPES

export function isKnownLogType(t: string): t is LOGTYPE {
    return LTYPES.hasOwnProperty(t)
}

/**
 * Centralized logging capability for the whole pancloud SDK
 */
class sdkLogger implements pancloudLogger {
    level: logLevel
    private stackTrace: boolean

    /**
     * 
     * @param level only messages with a level equal or avobe this provided value will be loogged
     * @param stackTrace boolean value to toggle stacktrace logging
     */
    constructor(level: logLevel, stackTrace = true) {
        this.level = level
        this.stackTrace = stackTrace
    }

    error(e: sdkErr): void {
        this.format(e.getSourceClass(),
            e.getErrorMessage(), logLevel.ERROR,
            e.name, e.getErrorCode(), undefined, e.stack)
    }

    alert(source: pancloudClass, message: string, name?: string): void {
        this.format(source.className, message, logLevel.ALERT, name)
    }

    info(source: pancloudClass, message: string, name?: string): void {
        this.format(source.className, message, logLevel.INFO, name)
    }

    debug(source: pancloudClass, message: string, name?: string, payload?: any): void {
        this.format(source.className, message, logLevel.DEBUG, name, undefined, payload)
    }

    private format(source: string, message: string, level: logLevel, name?: string, code?: string, payload?: any, stack?: string) {
        if (level >= this.level) {
            let output: { [i: string]: string } = {
                source,
                message
            }
            let payloadOut = ''
            if (name) {
                output['name'] = name
            }
            if (code) {
                output['code'] = code
            }
            if (stack) {
                output['stack'] = stack
            }
            if (payload) {
                if (typeof payload == 'string') {
                    payloadOut = payload
                } else {
                    let jsonText = JSON.stringify(payload)
                    if (jsonText.length > 300) {
                        payloadOut = jsonText.substr(0, 300) + ' ...'
                    } else {
                        payloadOut = jsonText
                    }

                }
            }
            let finalOutput = `PANCLOUD: ${JSON.stringify(output)}`
            if (payloadOut != '') {
                finalOutput += ` payload=${payloadOut}`
            }
            switch (level) {
                case logLevel.ERROR: {
                    console.error(finalOutput)
                    break
                }
                case logLevel.ALERT:
                case logLevel.INFO: {
                    console.info(finalOutput)
                    break
                }
                default: {
                    console.info(finalOutput)
                }
            }
            if (this.stackTrace && stack) {
                console.error(stack)
            }
        }
    }
}

/**
 * Instantiate a module-provided logger at load time
 */
export let commonLogger: pancloudLogger = new sdkLogger(logLevel.INFO, false)

/**
 * Developer might decide to change the loglevel of the logger object at runtime
 * @param newLevel the new log level
 */
export function setLogLevel(newLevel: logLevel): void {
    commonLogger.level = newLevel
}

/**
 * Changes the common logger variable to a user-provided object
 * @param logger user provided pancloudLogger compliant object to be used for SDK logging
 */
export function setLogger(logger: pancloudLogger): void {
    commonLogger = logger
}

/**
 * Abstract function used to retry multiple times a user-provided operation
 * @param source class using the retrier. Its className property value will be used in logs generated by the retrier 
 * @param n number of attempts
 * @param delay milliseconds to wait after a failed attempt
 * @param handler function that implements the operation
 * @param params additional arguments to be passed to the handler function
 */
export async function retrier<T, O>(source: pancloudClass, n = 3, delay = 100, handler: (...args: T[]) => Promise<O>, ...params: T[]): Promise<O> {
    let a = n
    let lastError: Error | undefined = undefined
    while (a > 0) {
        try {
            return await handler(...params)
        } catch (e) {
            commonLogger.info(source, `Failed attempt ${a}`, 'RETRIER')
            lastError = e
        }
        await new Promise((resolve) => {
            setTimeout(resolve, delay)
        })
        a--
    }
    throw (lastError) ? lastError : new Error('reties exhausted')
}