import { PancloudClass } from './common';
declare type SdkErrName = "PanCloudError" | "ApplicationFrameworkError";
export declare abstract class SdkErr extends Error {
    name: string;
    protected errorCode: string;
    protected errorMessage: string;
    protected sourceClass: string;
    constructor(message: string);
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(name: SdkErrName): void;
}
export declare function isSdkError(e: any): e is SdkErr;
export declare class ApplicationFrameworkError extends SdkErr {
    constructor(source: PancloudClass, afError: any);
}
declare type ErrCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN";
export declare class PanCloudError extends SdkErr {
    constructor(source: PancloudClass, code: ErrCodes, message: string);
    static fromError(sorce: PancloudClass, e: Error): PanCloudError;
}
export {};
