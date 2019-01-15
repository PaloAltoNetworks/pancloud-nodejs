import { sdkErr } from './error';
export interface pancloudClass {
    className: string;
}
export declare enum logLevel {
    DEBUG = 0,
    INFO = 1,
    ALERT = 2,
    ERROR = 3
}
export interface pancloudLogger {
    level: logLevel;
    error(e: sdkErr): void;
    alert(source: pancloudClass, message: string, name?: string): void;
    info(source: pancloudClass, message: string, name?: string): void;
    debug(source: pancloudClass, message: string, name?: string, payload?: any): void;
}
declare const LTYPES: {
    "panw.auth": string;
    "panw.config": string;
    "panw.dpi": string;
    "panw.dpi_hipreport": string;
    "panw.dpi_stats": string;
    "panw.gtp": string;
    "panw.gtpsum": string;
    "panw.hipmatch": string;
    "panw.sctp": string;
    "panw.sctpsum": string;
    "panw.system": string;
    "panw.threat": string;
    "panw.thsum": string;
    "panw.traffic": string;
    "panw.trsum": string;
    "panw.urlsum": string;
    "panw.userid": string;
    "tms.analytics": string;
    "tms.config": string;
    "tms.system": string;
    "tms.threat": string;
    "tms.traps": string;
};
export declare type ENTRYPOINT = 'https://api.eu.paloaltonetworks.com' | 'https://api.us.paloaltonetworks.com';
export declare type PATH = "event-service/v1/channels" | "logging-service/v1/queries";
export declare type LOGTYPE = keyof typeof LTYPES;
export declare function isKnownLogType(t: string): t is LOGTYPE;
export declare let commonLogger: pancloudLogger;
export declare function setLogLevel(newLevel: logLevel): void;
export declare function setLogger(logger: pancloudLogger): void;
export declare function retrier<T, O>(source: pancloudClass, n: number | undefined, delay: number | undefined, handler: (...args: T[]) => Promise<O>, ...params: T[]): Promise<O>;
export {};
