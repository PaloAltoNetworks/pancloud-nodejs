import { pancloudClass } from './common';
export declare type sdkErr = ApplicationFrameworkError | PanCloudError;
declare type sdkErrName = "ApplicationFrameworkError" | "PanCloudError";
interface appFerr {
    errorCode: string;
    errorMessage: string;
}
interface sdkErrorObj {
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(className: sdkErrName): void;
    name: string;
}
export declare function isSdkError(e: any): e is sdkErr;
export declare class ApplicationFrameworkError extends Error implements appFerr, sdkErrorObj {
    errorMessage: string;
    errorCode: string;
    sourceClass: string;
    constructor(source: pancloudClass, afError: any);
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(name: sdkErrName): void;
}
declare type errCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN";
export declare class PanCloudError extends Error implements sdkErrorObj {
    errorCode: errCodes;
    errorMessage: string;
    sourceClass: string;
    constructor(source: pancloudClass, code: errCodes, message: string);
    static fromError(sorce: pancloudClass, e: Error): PanCloudError;
    getErrorCode(): string;
    getErrorMessage(): string;
    getSourceClass(): string;
    setClassName(name: sdkErrName): void;
}
export {};
