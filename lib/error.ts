import { pancloudClass } from './common'

export type sdkErr = ApplicationFrameworkError | PanCloudError
type sdkErrName = "ApplicationFrameworkError" | "PanCloudError"

interface appFerr {
    errorCode: string,
    errorMessage: string
}

function isError(obj: any): obj is appFerr {
    return typeof obj.errorCode == 'string' && typeof obj.errorMessage == 'string'
}

interface sdkErrorObj {
    getErrorCode(): string
    getErrorMessage(): string
    getSourceClass(): string
    setClassName(className: sdkErrName): void
    name: string
}

export function isSdkError(e: any): e is sdkErr {
    return e &&
        e.getErrorCode && typeof e.getErrorCode == "function" &&
        e.getErrorMessage && typeof e.getErrorMessage == "function" &&
        e.getSourceClass && typeof e.getSourceClass == "function" &&
        e.name && typeof e.name == "string" &&
        (e.name == <sdkErrName>"PanCloudError" || e.name == <sdkErrName>"ApplicationFrameworkError")
}

export class ApplicationFrameworkError extends Error implements appFerr, sdkErrorObj {
    errorMessage: string
    errorCode: string
    sourceClass: string

    constructor(source: pancloudClass, afError: any) {
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

    setClassName(name: sdkErrName): void {
        this.name = name
    }
}

type errCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN"

export class PanCloudError extends Error implements sdkErrorObj {
    errorCode: errCodes
    errorMessage: string
    sourceClass: string

    constructor(source: pancloudClass, code: errCodes, message: string) {
        super(message)
        this.errorCode = code
        this.errorMessage = message
        this.sourceClass = source.className
        this.setClassName("PanCloudError")
    }

    static fromError(sorce: pancloudClass, e: Error): PanCloudError {
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

    setClassName(name: sdkErrName): void {
        this.name = name
    }
}