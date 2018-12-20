import { sdkErr } from './error'

export interface pancloudClass {
    className: string
}

export interface pancloudLogger {
    error(e: sdkErr): void,
    alert(source: pancloudClass, message: string, name?: string): void,
    info(source: pancloudClass, message: string, name?: string): void
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

enum logLevel {
    INFO = 0b001,
    ALERT = 0b010,
    ERROR = 0b100,
    TRACE = 0b111
}

class sdkLogger implements pancloudLogger {
    private level: logLevel
    private stackTrace: boolean

    constructor(level: logLevel, stackTrace = true) {
        this.level = level
        this.stackTrace = stackTrace
    }

    error(e: sdkErr): void {
        this.format(e.getSourceClass(),
            e.name, e.getErrorMessage(),
            logLevel.ERROR, e.getErrorCode(), e.stack)
    }

    alert(source: pancloudClass, message: string, name = ""): void {
        this.format(source.className, name, message, logLevel.ALERT, "unknown", undefined)
    }

    info(source: pancloudClass, message: string, name = ""): void {
        this.format(source.className, name, message, logLevel.INFO, "unknown", undefined)
    }

    private format(source: string, name: string, message: string, level: logLevel, code: string, stack: string | undefined) {
        if (level && this.level) {
            console.log(`PANCLOUD - source:${source}, name:${name}, message:${message} code:${code}`)
            if (this.stackTrace && stack) {
                console.log(stack)
            }
        }
    }
}

export let commonLogger: pancloudLogger = new sdkLogger(logLevel.INFO, false)

export function setLogger(logger: pancloudLogger): void {
    commonLogger = logger
}