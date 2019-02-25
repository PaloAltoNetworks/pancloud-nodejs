import { PancloudClass } from './common'

export type SdkErr = ApplicationFrameworkError | PanCloudError
type SdkErrName = "ApplicationFrameworkError" | "PanCloudError"

interface AppFerr {
    errorCode: string,
    errorMessage: string
}

function isError(obj: any): obj is AppFerr {
    return typeof obj.errorCode == 'string' && typeof obj.errorMessage == 'string'
}

interface SdkErrorObj {
    getErrorCode(): string
    getErrorMessage(): string
    getSourceClass(): string
    setClassName(className: SdkErrName): void
    name: string
}

export function isSdkError(e: any): e is SdkErr {
    return e &&
        e.getErrorCode && typeof e.getErrorCode == "function" &&
        e.getErrorMessage && typeof e.getErrorMessage == "function" &&
        e.getSourceClass && typeof e.getSourceClass == "function" &&
        e.name && typeof e.name == "string" &&
        (e.name == <SdkErrName>"PanCloudError" || e.name == <SdkErrName>"ApplicationFrameworkError")
}

export class ApplicationFrameworkError extends Error implements AppFerr, SdkErrorObj {
    errorMessage: string
    errorCode: string
    sourceClass: string

    constructor(source: PancloudClass, afError: any) {
        if (isError(afError)) {
            super(afError.errorMessage)
            this.errorMessage = afError.errorMessage
            this.errorCode = afError.errorCode
        } else {
            super("Unparseable Application Framework error message")
            this.errorMessage = JSON.stringify(afError)
            this.errorCode = ''
        }
        this.sourceClass = source.className
        this.setClassName("ApplicationFrameworkError")
    }

    getErrorCode(): string {
        return this.errorCode
    }

    getErrorMessage(): string {
        return this.errorMessage
    }

    getSourceClass(): string {
        return this.sourceClass
    }

    setClassName(name: SdkErrName): void {
        this.name = name
    }
}

type ErrCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN"

export class PanCloudError extends Error implements SdkErrorObj {
    errorCode: ErrCodes
    errorMessage: string
    sourceClass: string

    constructor(source: PancloudClass, code: ErrCodes, message: string) {
        super(message)
        this.errorCode = code
        this.errorMessage = message
        this.sourceClass = source.className
        this.setClassName("PanCloudError")
    }

    static fromError(sorce: PancloudClass, e: Error): PanCloudError {
        let newpce = new PanCloudError(sorce, "UNKNOWN", e.message)
        newpce.stack = e.stack
        return newpce
    }

    getErrorCode(): string {
        return this.errorCode
    }

    getErrorMessage(): string {
        return this.errorMessage
    }

    getSourceClass(): string {
        return this.sourceClass
    }

    setClassName(name: SdkErrName): void {
        this.name = name
    }
}