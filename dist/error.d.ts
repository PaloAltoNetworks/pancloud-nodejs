import { PancloudClass } from './common';
export declare type SdkErr = ApplicationFrameworkError | PanCloudError;
declare type SdkErrName = "ApplicationFrameworkError" | "PanCloudError";
interface AppFerr {
    errorCode: string;
    errorMessage: string;
}
interface SdkErrorObj {
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(className: SdkErrName): void;
    name: string;
}
export declare function isSdkError(e: any): e is SdkErr;
export declare class ApplicationFrameworkError extends Error implements AppFerr, SdkErrorObj {
    errorMessage: string;
    errorCode: string;
    sourceClass: string;
    constructor(source: PancloudClass, afError: any);
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(name: SdkErrName): void;
}
declare type ErrCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN";
export declare class PanCloudError extends Error implements SdkErrorObj {
    errorCode: ErrCodes;
    errorMessage: string;
    sourceClass: string;
    constructor(source: PancloudClass, code: ErrCodes, message: string);
    static fromError(sorce: PancloudClass, e: Error): PanCloudError;
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(name: SdkErrName): void;
}
export {};
