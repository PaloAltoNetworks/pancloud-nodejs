import { LOGTYPE } from './common';
import { coreClass, emittedEvent, coreOptions } from './core';
declare const jStatus: {
    'RUNNING': string;
    'FINISHED': string;
    'JOB_FINISHED': string;
    'JOB_FAILED': string;
};
export declare type jobStatus = keyof typeof jStatus;
export interface lsQuery {
    query: string;
    endTime: number;
    startTime: number;
    maxWaitTime?: number;
    client?: string;
    clientParameters?: any;
    logType?: LOGTYPE;
}
export interface jobResult {
    queryId: string;
    sequenceNo: number;
    queryStatus: jobStatus;
    result: {
        esResult: null | {
            hits: {
                hits: {
                    _index: string;
                    _type: string;
                    _source: any;
                }[];
            };
        };
    };
}
export declare class LoggingService extends coreClass {
    private url;
    private eevent;
    private ap_sleep;
    private tout;
    private jobQueue;
    private lastProcElement;
    private pendingQueries;
    private fetchTimeout;
    static className: string;
    private constructor();
    static factory(ops: coreOptions): LoggingService;
    query(cfg: lsQuery, eCallBack?: ((e: emittedEvent) => void) | null, sleep?: number, fetchTimeout?: number): Promise<jobResult>;
    poll(qid: string, sequenceNo: number, maxWaitTime?: number): Promise<jobResult>;
    private static autoPoll;
    cancelPoll(qid: string): void;
    delete_query(queryId: string): Promise<void>;
    private eventEmitter;
    private emitterCleanup;
}
export {};
