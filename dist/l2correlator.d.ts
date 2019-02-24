import { emitterInterface } from "./emitter";
interface event {
    time_generated: string;
    sessionid: string;
}
interface l3event extends event {
    src: string;
    dst: string;
}
interface l2event extends event {
    "extended-traffic-log-mac": string;
    "extended-traffic-log-mac-stc": string;
}
export declare type correlatedEvent = l2event & l3event;
export interface procResponse {
    plain: emitterInterface<any[]>[];
    correlated?: emitterInterface<correlatedEvent[]>;
}
export interface correlationStats {
    agedOut: number;
    dbWaterMark: number;
    dbInserts: number;
    discardedEvents: number;
}
export declare class macCorrelator {
    private ageout;
    private absoluteTime;
    private gbMultiplier;
    private gbAttempt;
    private db;
    private lastTs;
    stats: correlationStats;
    constructor(ageout?: number, absoluteTime?: boolean, gbMultiplier?: number);
    private gb;
    private update;
    process(e: emitterInterface<any[]>): procResponse;
    flush(): procResponse;
}
export {};
