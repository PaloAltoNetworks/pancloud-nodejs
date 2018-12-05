// Logging Service

import fetch from 'node-fetch'
import { Credentials } from './credentials'
import { C } from './constants'
import { ApplicationFrameworkError } from './error'

export interface esFilter {
    filters: {
        [index: string]: {
            filter: string,
            timeout?: number,
            batchSize?: number
        }
    }[],
    flush?: boolean
}

function is_esFilter(obj: any): obj is esFilter {
    if (obj && typeof obj == "object") {
        if ("filters" in obj && typeof obj.filters == "object" && obj.filters instanceof Array) {
            let obj2 = obj.filters as {}[]
            return obj2.every(e => {
                if (e && typeof e == "object") {
                    let obj2_e = Object.entries(e)
                    if (obj2_e.length == 1 && typeof obj2_e[0][0] == "string" && typeof obj2_e[0][1] == "object") {
                        let obj3 = obj2_e[0][1] as any
                        return (
                            typeof obj3['filter'] == "string" &&
                            ["number", "undefined"].includes(typeof obj3['timeout']) &&
                            ["number", "undefined"].includes(typeof obj3['batchSize']))
                    }
                    return false
                }
                return false
            })
        }
    }
    return false
}

export interface esFilterBuilderEntry {
    table: string,
    where?: string,
    timeout?: number,
    batchSize?: number,
}

export class EventService {
    private cred: Credentials
    private entryPoint: string
    private filterUrl: string
    private pollUrl: string
    private ackUrl: string
    private nackUrl: string
    private flushUrl: string

    private constructor(credential: Credentials, entryPoint: string, channelId: string) {
        this.cred = credential
        this.entryPoint = entryPoint
        this.setChannel(channelId)
    }

    setChannel(channelId: string): void {
        this.filterUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/filters`
        this.pollUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/poll`
        this.ackUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/ack`
        this.nackUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/nack`
        this.flushUrl = `${this.entryPoint}/${C.ESPATH}/${channelId}/flush`
    }

    static factory(cred: Credentials, entryPoint: string, channelId = 'EventFilter'): EventService {
        return new EventService(cred, entryPoint, channelId)
    }

    async setFilters(payload: esFilter): Promise<void> {
        let res = await fetch(this.filterUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.cred.get_access_token()
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) return
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        throw new ApplicationFrameworkError(r_json)
    }

    async getFilters(): Promise<esFilter> {
        let res = await fetch(this.filterUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.cred.get_access_token()
            }
        });
        let r_json: any
        try {
            r_json = await res.json()
        } catch (exception) {
            throw new Error(`PanCloudError() Invalid JSON: ${exception.message}`)
        }
        if (!res.ok) {
            throw new ApplicationFrameworkError(r_json)
        }
        if (is_esFilter(r_json)) {
            return r_json
        }
        throw new Error(`PanCloudError() response is not a valid ES Filter: ${JSON.stringify(r_json)}`)
    }

    filterBuilder(entries: esFilterBuilderEntry[], flush = false): Promise<void> {
        let f: esFilter = {
            filters: entries.map(e => {
                let m: {
                    [index: string]: {
                        filter: string,
                        timeout?: number,
                        batchSize?: number
                    }
                } = {}
                m[e.table] = { filter: `select * from \`${e.table}\`` }
                if (e.where) {
                    m[e.table].filter += ` where ${e.where}`
                }
                m[e.table].timeout = e.timeout
                m[e.table].batchSize = e.batchSize
                return m
            }),
            flush: flush
        }
        return this.setFilters(f)
    }

    clearFilter(): Promise<void> {
        return this.setFilters({ filters: [] })
    }
}