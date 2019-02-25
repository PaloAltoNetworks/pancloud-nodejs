import { PATH, ENTRYPOINT } from "./common"
import { URL } from 'url'
import { CoreClass, CoreOptions, CoreStats } from "./core"
import { PanCloudError } from "./exceptions";

const DSS_PATH: PATH = "directory-sync-service/v1"

interface DssDomain {
    "dn": string,
    "dns": string,
    "netbios": string,
    "status": {
        "statusText": string,
        "statusUpdateTime": number,
        "syncUpdateTime": number
    }
}

function isDssDomain(obj: any): obj is DssDomain {
    return obj.dn && typeof obj.dn == 'string' &&
        obj.dns && typeof obj.dns == 'string' &&
        obj.netbios && typeof obj.netbios == 'string' &&
        obj.status && typeof obj.status == 'object' &&
        obj.status.statusText && typeof obj.status.statusText == 'string' &&
        obj.status.statusUpdateTime && typeof obj.status.statusUpdateTime == 'number' &&
        obj.status.syncUpdateTime && typeof obj.status.syncUpdateTime == 'number'
}

interface DssResponseDomains {
    result: DssDomain[]
}

function isDssResponseDomains(obj: any): obj is DssResponseDomains {
    if (obj.result && typeof obj.result == 'object' && Array.isArray(obj.result)) {
        return (obj.result as Array<any>).every(x => isDssDomain(x))
    }
    return false
}

interface DssResponseAttrMap {
    result: DssAttributeMap
}

function isDssResponseAttrMap(obj: any): obj is DssResponseAttrMap {
    if (obj.result && typeof obj.result == 'object') {
        return isDSSAttributeMap(obj.result)
    }
    return false
}

interface DssResponseCount {
    result: {
        count: number
    }
}

function isDssResponseCount(obj: any): obj is DssResponseCount {
    if (obj.result && typeof obj.result == 'object') {
        return obj.result.count && typeof obj.result.count == 'number'
    }
    return false
}

interface DssQuery {
    domainName: string
    lastSyncTmp?: number,
    syncUpdateTime?: number,
    objects?: any[],
    directoryEntries?: any[]
}

function isDssQuery(obj: any): obj is DssQuery {
    return obj.domainName && typeof obj.domainName == 'string' &&
        (!('lastSyncTmp' in obj) || typeof obj.lastSyncTmp == 'number') &&
        (!('syncUpdateTime' in obj) || typeof obj.syncUpdateTime == 'number') &&
        (!('objects' in obj) || (typeof obj.objects == 'object' && Array.isArray(obj.objects))) &&
        (!('directoryEntries' in obj) || (typeof obj.directoryEntries == 'object' && Array.isArray(obj.directoryEntries)))
}

interface DssResponseQuery {
    count: number,
    pageNumber: number,
    pageSize: number,
    unreadResults?: number,
    result: DssQuery[]
}

function isDssResponseQuery(obj: any): obj is DssResponseQuery {
    if (obj.result && typeof obj.result == 'object' && Array.isArray(obj.result) &&
        obj.count && typeof obj.count == 'number' &&
        obj.pageNumber && typeof obj.pageNumber == 'number' &&
        obj.pageSize && typeof obj.pageSize == 'number' &&
        (!(obj.unreadResults) || typeof obj.unreadResults == 'number')) {
        return (obj.result as Array<any>).every(x => isDssQuery(x))
    }
    return false
}

export interface DssStats extends CoreStats {
    queries: number,
    domainCall: number,
    attributeCall: number,
    countCall: number
}

interface DssQueryFilter {
    domain: string,
    name?: {
        attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name',
        attributeValue: string,
        matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal',
    },
    filter?: {
        type: 'container' | 'ou' | 'group',
        level: 'immediate' | 'recursive',
        name: {
            attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name',
            attributeValue: string,
            matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal',
        }
    },
    pageNumber?: number,
    pageSize?: number
}

export class DirectorySyncService extends CoreClass {
    protected stats: DssStats
    private dssAttrMap: DssAttributeMap

    private constructor(entryPoint: string, ops: CoreOptions) {
        super(entryPoint, ops)
        this.className = "DirectorySyncService"
        this.stats = {
            queries: 0,
            domainCall: 0,
            attributeCall: 0,
            countCall: 0,
            ...this.stats
        }
    }

    static async factory(entryPoint: ENTRYPOINT, ops: CoreOptions) {
        return new DirectorySyncService(new URL(DSS_PATH, entryPoint).toString(), ops)
    }

    private async fetcher<T, R>(path: string, checker: (a: any) => a is T, action: (b: T) => R, query?: DssQueryFilter | {}): Promise<R> {
        let res: any
        if (query) {
            res = await this.fetchPostWrap(path, JSON.stringify(query))
        } else {
            res = await this.fetchGetWrap(path)
        }
        if (checker(res)) {
            return action(res)
        }
        throw new PanCloudError(`Invalid schema in the response received: ${JSON.stringify(res)}`)
    }

    async attributes(): Promise<DssAttributeMap> {
        this.stats.attributeCall++
        return this.fetcher('/attributes', isDssResponseAttrMap, x => {
            this.dssAttrMap = x.result
            return this.dssAttrMap
        })
    }

    async domains(): Promise<DssDomain[]> {
        this.stats.domainCall++
        return this.fetcher('/domains', isDssResponseDomains, x => x.result)
    }

    async count(domain: string, objClass: DssObjClass): Promise<number> {
        this.stats.countCall++
        return this.fetcher(`/${objClass}/count?domain=${encodeURIComponent(domain)}`,
            isDssResponseCount, x => x.result.count)
    }

    async query(objClass: DssObjClass, query: DssQueryFilter | {} = {}): Promise<DssResponseQuery> {
        this.stats.queries++
        return this.fetcher(`/${objClass}`, isDssResponseQuery, x => x, query)
    }
}

export type DssObjClass = "containers" | "computers" | "ous" | "groups" | "users"

export interface DssAttributeMap {
    "computer": {
        "Common-Name": string,
        "Distinguished Name": string,
        "Groups": string,
        "HostName": string,
        "Last Login": string,
        "LastLogonTime": string,
        "NETBIOS Name": string,
        "Name": string,
        "OS": string,
        "OSServicePack": string,
        "OSVersion": string,
        "Object Class": string,
        "Primary Group ID": string,
        "SAM Account Name": string,
        "SID": string,
        "Unique Identifier": string,
        "User Principal Name": string,
        "UserAccountControl": string,
        "WhenChanged": string
    },
    "container": {
        "Canonical Name": string,
        "Common-Name": string,
        "Distinguished Name": string,
        "Name": string,
        "Object Class": string,
        "Unique Identifier": string,
        "WhenChanged": string
    },
    "group": {
        "Common-Name": string,
        "Distinguished Name": string,
        "Group Type": string,
        "Groups": string,
        "Member": string,
        "Name": string,
        "Object Class": string,
        "SAM Account Name": string,
        "SID": string,
        "Unique Identifier": string,
        "WhenChanged": string
    },
    "ou": {
        "Canonical Name": string,
        "Common-Name": string,
        "Distinguished Name": string,
        "Name": string,
        "Object Class": string,
        "Unique Identifier": string,
        "WhenChanged": string
    },
    "user": {
        "Common-Name": string,
        "Country": string,
        "Department": string,
        "Distinguished Name": string,
        "Groups": string,
        "Last Login": string,
        "LastLogonTime": string,
        "Location": string,
        "Mail": string,
        "Manager": string,
        "NETBIOS Name": string,
        "Name": string,
        "Object Class": string,
        "Primary Group ID": string,
        "SAM Account Name": string,
        "SID": string,
        "Title": string,
        "Unique Identifier": string,
        "User Principal Name": string,
        "UserAccountControl": string,
        "WhenChanged": string,
    }
}

function isDSSAttributeMap(obj: any): obj is DssAttributeMap {
    return true
}