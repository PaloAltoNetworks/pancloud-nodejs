import { PancloudClass } from './common'

type SdkErrName = "PanCloudError" | "ApplicationFrameworkError"

interface AppFerr {
    errorCode: string
    errorMessage: string
}

function isError(obj: any): obj is AppFerr {
    return typeof obj.errorCode == 'string' && typeof obj.errorMessage == 'string'
}

export abstract class SdkErr extends Error {
    name: string
    protected errorCode: string
    protected errorMessage: string
    protected sourceClass: string

    constructor(message: string) {
        super(message)
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

export function isSdkError(e: any): e is SdkErr {
    return e &&
        e.getErrorCode && typeof e.getErrorCode == "function" &&
        e.getErrorMessage && typeof e.getErrorMessage == "function" &&
        e.getSourceClass && typeof e.getSourceClass == "function" &&
        e.name && typeof e.name == "string" &&
        (e.name == <SdkErrName>"PanCloudError" || e.name == <SdkErrName>"ApplicationFrameworkError")
}

export class ApplicationFrameworkError extends SdkErr {

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
}

type ErrCodes = "PARSER" | "IDENTITY" | "CONFIG" | "UNKNOWN"

export class PanCloudError extends SdkErr {

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
}