import { sdkErr } from './error'

export interface pancloudClass {
    className: string
}

export enum logLevel {
    DEBUG = 0,
    INFO = 1,
    ALERT = 2,
    ERROR = 3,
}

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

export type ENTRYPOINT = 'https://api.eu.paloaltonetworks.com' | 'https://api.us.paloaltonetworks.com'
export type PATH = "event-service/v1/channels" | "logging-service/v1/queries"
export type LOGTYPE = keyof typeof LTYPES

export function isKnownLogType(t: string): t is LOGTYPE {
    return LTYPES.hasOwnProperty(t)
}

class sdkLogger implements pancloudLogger {
    level: logLevel
    private stackTrace: boolean

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
                    if (jsonText.length > 256) {
                        payloadOut = jsonText.substr(0, 256) + ' ...'
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

export let commonLogger: pancloudLogger = new sdkLogger(logLevel.INFO, false)

export function setLogLevel(newLevel: logLevel): void {
    commonLogger.level = newLevel
}

export function setLogger(logger: pancloudLogger): void {
    commonLogger = logger
}

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