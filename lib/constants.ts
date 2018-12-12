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
export const APPFRERR = "ApplicationFrameworkError"

export function isKnownLogType(t: string): t is LOGTYPE {
    return LTYPES.hasOwnProperty(t)
}