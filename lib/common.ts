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

/**
 * Provides common resources for other modules in the pancloud SDK
 */

import { SdkErr, PanCloudError } from './error'
import { createHash } from 'crypto'

/**
 * A pancloud class must provide a className property that will be used to format its log messages
 */
export interface PancloudClass {
    className: string
}

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    ALERT = 2,
    ERROR = 3,
}

/**
 * User-provided logger classes are supported as long as they adhere to this interface
 */
export interface PancloudLogger {
    level: LogLevel,
    error(e: SdkErr): void,
    alert(source: PancloudClass, message: string, name?: string): void,
    info(source: PancloudClass, message: string, name?: string): void,
    debug(source: PancloudClass, message: string, name?: string, payload?: any): void
}

const LTYPES = {
    "panw.auth": "",
    "panw.config": "",
    "panw.dpi": "",
    "panw.dpi_hipreport": "",
    "panw.dpi_stats": "",
    "panw.gtp": "",
    "panw.gtpsum": "",
    "panw.hipmatch": "",
    "panw.sctp": "",
    "panw.sctpsum": "",
    "panw.system": "",
    "panw.threat": "",
    "panw.thsum": "",
    "panw.traffic": "",
    "panw.trsum": "",
    "panw.urlsum": "",
    "panw.userid": "",
    "tms.analytics": "",
    "tms.config": "",
    "tms.system": "",
    "tms.threat": "",
    "tms.traps": ""
}

/**
 * Convenience type to guide the developer using the right entry points
 */
export type EntryPoint = 'https://api.eu.paloaltonetworks.com' | 'https://api.us.paloaltonetworks.com'
export const region2EntryPoint: { [region: string]: EntryPoint } = {
    'americas': 'https://api.us.paloaltonetworks.com',
    'europe': 'https://api.eu.paloaltonetworks.com'
}

export type OAUTH2SCOPE = 'logging-service:read' | 'logging-service:write' |
    'event-service:read' | 'directory-sync-service:read'

export type ApiPath = "event-service/v1/channels" | "logging-service/v1" | "directory-sync-service/v1"

/**
 * Convenience type to guide the developer using the common log types
 */
export type LogType = keyof typeof LTYPES

export function isKnownLogType(t: string): t is LogType {
    return LTYPES.hasOwnProperty(t)
}

/**
 * Centralized logging capability for the whole pancloud SDK
 */
class SdkLogger implements PancloudLogger {
    level: LogLevel
    private stackTrace: boolean

    /**
     * 
     * @param level only messages with a level equal or avobe this provided value will be loogged
     * @param stackTrace boolean value to toggle stacktrace logging
     */
    constructor(level: LogLevel, stackTrace = true) {
        this.level = level
        this.stackTrace = stackTrace
    }

    error(e: SdkErr): void {
        this.format(e.getSourceClass(),
            e.getErrorMessage(), LogLevel.ERROR,
            e.name, e.getErrorCode(), undefined, e.stack)
    }

    alert(source: PancloudClass, message: string, name?: string): void {
        this.format(source.className, message, LogLevel.ALERT, name)
    }

    info(source: PancloudClass, message: string, name?: string): void {
        this.format(source.className, message, LogLevel.INFO, name)
    }

    debug(source: PancloudClass, message: string, name?: string, payload?: any): void {
        this.format(source.className, message, LogLevel.DEBUG, name, undefined, payload)
    }

    private format(source: string, message: string, level: LogLevel, name?: string, code?: string, payload?: any, stack?: string) {
        if (level >= this.level) {
            let output: { [i: string]: string } = {
                source,
                message
            }
            let payloadOut = ''
            if (name) {
                output['name'] = name
            }
            if (code) {
                output['code'] = code
            }
            if (stack) {
                output['stack'] = stack
            }
            if (payload) {
                if (typeof payload == 'string') {
                    payloadOut = payload
                } else {
                    let jsonText = JSON.stringify(payload)
                    if (jsonText.length > 300) {
                        payloadOut = jsonText.substr(0, 300) + ' ...'
                    } else {
                        payloadOut = jsonText
                    }

                }
            }
            let finalOutput = `PANCLOUD: ${JSON.stringify(output)}`
            if (payloadOut != '') {
                finalOutput += ` payload=${payloadOut}`
            }
            switch (level) {
                case LogLevel.ERROR: {
                    console.error(finalOutput)
                    break
                }
                case LogLevel.ALERT:
                case LogLevel.INFO: {
                    console.info(finalOutput)
                    break
                }
                default: {
                    console.info(finalOutput)
                }
            }
            if (this.stackTrace && stack) {
                console.error(stack)
            }
        }
    }
}

/**
 * Instantiate a module-provided logger at load time
 */
export let commonLogger: PancloudLogger = new SdkLogger(LogLevel.INFO, false)

/**
 * Developer might decide to change the loglevel of the logger object at runtime
 * @param newLevel the new log level
 */
export function setLogLevel(newLevel: LogLevel): void {
    commonLogger.level = newLevel
}

/**
 * Changes the common logger variable to a user-provided object
 * @param logger user provided pancloudLogger compliant object to be used for SDK logging
 */
export function setLogger(logger: PancloudLogger): void {
    commonLogger = logger
}

/**
 * Abstract function used to retry multiple times a user-provided operation
 * @param source class using the retrier. Its className property value will be used in logs generated by the retrier 
 * @param n number of attempts
 * @param delay milliseconds to wait after a failed attempt
 * @param handler function that implements the operation
 * @param params additional arguments to be passed to the handler function
 */
export async function retrier<T, O>(source: PancloudClass, n = 3, delay = 100, handler: (...args: T[]) => Promise<O>, ...params: T[]): Promise<O> {
    let a = n
    let lastError: Error | undefined = undefined
    while (a > 0) {
        try {
            return await handler(...params)
        } catch (e) {
            commonLogger.info(source, `Failed attempt ${a}`, 'RETRIER')
            lastError = e
        }
        await new Promise((resolve) => {
            setTimeout(resolve, delay)
        })
        a--
    }
    throw (lastError) ? lastError : new Error('reties exhausted')
}

export function expTokenExtractor(source: PancloudClass, token: string): number {
    let parts = token.split('.')
    if (parts.length != 3) {
        throw new PanCloudError(source, 'PARSER', 'Not a valid JWT token format')
    }
    let expAttribute: any
    try {
        expAttribute = JSON.parse(Buffer.from(parts[1], 'base64').toString()).exp
    } catch {
        throw new PanCloudError(source, 'PARSER', 'Not a valid JWT token format')
    }
    if (typeof expAttribute == 'number') {
        return expAttribute
    }
    throw new PanCloudError(source, 'PARSER', 'JWT token does not have a valid "exp" field')
}

export function uid(): string {
    let data = `pancloud${Date.now()}nodejs`
    return createHash('sha1').update(data).digest('base64')
}