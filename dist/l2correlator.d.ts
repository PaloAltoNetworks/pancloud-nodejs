import { EmitterInterface } from "./emitter";
interface Event {
    time_generated: string;
    sessionid: string;
}
interface L3event extends Event {
    src: string;
    dst: string;
}
interface L2event extends Event {
    "extended-traffic-log-mac": string;
    "extended-traffic-log-mac-stc": string;
}
export declare type CorrelatedEvent = L2event & L3event;
export interface ProcResponse {
    plain: EmitterInterface<any[]>[];
    correlated?: EmitterInterface<CorrelatedEvent[]>;
}
export interface CorrelationStats {
    agedOut: number;
    dbWaterMark: number;
    dbInserts: number;
    discardedEvents: number;
}
export declare class MacCorrelator {
    private ageout;
    private absoluteTime;
    private gbMultiplier;
    private gbAttempt;
    private db;
    private lastTs;
    stats: CorrelationStats;
    constructor(ageout?: number, absoluteTime?: boolean, gbMultiplier?: number);
    private gb;
    private update;
    process(e: EmitterInterface<any[]>): ProcResponse;
    flush(): ProcResponse;
}
export {};
