// Copyright 2015-2019 Palo Alto Networks, Inc
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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