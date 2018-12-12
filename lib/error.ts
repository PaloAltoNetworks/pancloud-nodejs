import { APPFRERR } from "./constants"

export interface appFerr {
    errorCode: string,
    errorMessage: string
}

function isError(obj: any): obj is appFerr {
    return typeof obj.errorCode == 'string' && typeof obj.errorMessage == 'string'
}

export class ApplicationFrameworkError extends Error implements appFerr {
    errorMessage: string
    errorCode: string
    constructor(afError: any) {
        if (isError(afError)) {
            super(afError.errorMessage)
            this.errorMessage = afError.errorMessage
            this.errorCode = afError.errorCode
        } else {
            super("Unparseable Application Framework error message")
            this.errorMessage = JSON.stringify(afError)
            this.errorCode = ''
        }
        this.name = APPFRERR
    }
}
