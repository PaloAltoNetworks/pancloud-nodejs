interface constants {
    ENTRYPOINT: {
        europe: string
        americas: string
    },
    ESPATH: string,
    T: {
        PANW_AUTH: string,
        PANW_CONFIG: string,
        PANW_DPI: string,
        PANW_DPI_HIPREPORT: string,
        PANW_DPI_STATS: string,
        PANW_GTP: string,
        PANW_GTPSUM: string,
        PANW_HIPMATCH: string,
        PANW_SCTP: string,
        PANW_SCTPSUM: string,
        PANW_SYSTEM: string,
        PANW_THREAT: string,
        PANW_THSUM: string,
        PANW_TRAFFIC: string,
        PANW_TRSUM: string,
        PANW_URLSUM: string,
        PANW_USERID: string,
        PANW_ANALYTICS: string,
        TMS_TRAPS: string
    },
    APPFRERR: string
}

export let C = Object.freeze({
    ENTRYPOINT: {
        europe: 'https://api.eu.paloaltonetworks.com',
        americas: 'https://api.us.paloaltonetworks.com'
    },
    ESPATH: "event-service/v1/channels",
    T: {
        PANW_AUTH: "panw.auth",
        PANW_CONFIG: "panw.config",
        PANW_DPI: "panw.dpi",
        PANW_DPI_HIPREPORT: "panw.dpi_hipreport",
        PANW_DPI_STATS: "panw.dpi_stats",
        PANW_GTP: "panw.gtp",
        PANW_GTPSUM: "panw.gtpsum",
        PANW_HIPMATCH: "panw.hipmatch",
        PANW_SCTP: "panw.sctp",
        PANW_SCTPSUM: "panw.sctpsum",
        PANW_SYSTEM: "panw.system",
        PANW_THREAT: "panw.threat",
        PANW_THSUM: "panw.thsum",
        PANW_TRAFFIC: "panw.traffic",
        PANW_TRSUM: "panw.trsum",
        PANW_URLSUM: "panw.urlsum",
        PANW_USERID: "panw.userid",
        PANW_ANALYTICS: "tms.analytics",
        TMS_TRAPS: "tms.traps",
    },
    APPFRERR: "ApplicationFrameworkError"
} as constants)