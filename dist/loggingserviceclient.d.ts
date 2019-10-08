/// <reference types="node" />
import { LoggingService, LsQueryCfg } from './loggingservice';
import { Readable, ReadableOptions } from 'stream';
export declare class LoggingServiceClient extends Readable {
    private ls;
    private cfg;
    private jr;
    private init;
    private retries;
    private delay;
    private state;
    private sequence;
    static className: string;
    private pusher;
    constructor(ls: LoggingService, cfg: LsQueryCfg & {
        retries?: number;
        delay?: number;
    }, opts?: ReadableOptions);
    private lazyInit;
    _read(): void;
    _destroy(error: Error | null, callback: (error?: Error | null) => void): void;
}
