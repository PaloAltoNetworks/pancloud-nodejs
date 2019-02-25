import { ENTRYPOINT } from "./common";
import { CoreClass, CoreOptions, CoreStats } from "./core";
interface DssDomain {
    "dn": string;
    "dns": string;
    "netbios": string;
    "status": {
        "statusText": string;
        "statusUpdateTime": number;
        "syncUpdateTime": number;
    };
}
interface DssQuery {
    domainName: string;
    lastSyncTmp?: number;
    syncUpdateTime?: number;
    objects?: any[];
    directoryEntries?: any[];
}
interface DssResponseQuery {
    count: number;
    pageNumber: number;
    pageSize: number;
    unreadResults?: number;
    result: DssQuery[];
}
export interface DssStats extends CoreStats {
    queries: number;
    domainCall: number;
    attributeCall: number;
    countCall: number;
}
interface DssQueryFilter {
    domain: string;
    name?: {
        attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name';
        attributeValue: string;
        matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal';
    };
    filter?: {
        type: 'container' | 'ou' | 'group';
        level: 'immediate' | 'recursive';
        name: {
            attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name';
            attributeValue: string;
            matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal';
        };
    };
    pageNumber?: number;
    pageSize?: number;
}
export declare class DirectorySyncService extends CoreClass {
    protected stats: DssStats;
    private dssAttrMap;
    private constructor();
    static factory(entryPoint: ENTRYPOINT, ops: CoreOptions): Promise<DirectorySyncService>;
    private fetcher;
    attributes(): Promise<DssAttributeMap>;
    domains(): Promise<DssDomain[]>;
    count(domain: string, objClass: DssObjClass): Promise<number>;
    query(objClass: DssObjClass, query?: DssQueryFilter | {}): Promise<DssResponseQuery>;
}
export declare type DssObjClass = "containers" | "computers" | "ous" | "groups" | "users";
export interface DssAttributeMap {
    "computer": {
        "Common-Name": string;
        "Distinguished Name": string;
        "Groups": string;
        "HostName": string;
        "Last Login": string;
        "LastLogonTime": string;
        "NETBIOS Name": string;
        "Name": string;
        "OS": string;
        "OSServicePack": string;
        "OSVersion": string;
        "Object Class": string;
        "Primary Group ID": string;
        "SAM Account Name": string;
        "SID": string;
        "Unique Identifier": string;
        "User Principal Name": string;
        "UserAccountControl": string;
        "WhenChanged": string;
    };
    "container": {
        "Canonical Name": string;
        "Common-Name": string;
        "Distinguished Name": string;
        "Name": string;
        "Object Class": string;
        "Unique Identifier": string;
        "WhenChanged": string;
    };
    "group": {
        "Common-Name": string;
        "Distinguished Name": string;
        "Group Type": string;
        "Groups": string;
        "Member": string;
        "Name": string;
        "Object Class": string;
        "SAM Account Name": string;
        "SID": string;
        "Unique Identifier": string;
        "WhenChanged": string;
    };
    "ou": {
        "Canonical Name": string;
        "Common-Name": string;
        "Distinguished Name": string;
        "Name": string;
        "Object Class": string;
        "Unique Identifier": string;
        "WhenChanged": string;
    };
    "user": {
        "Common-Name": string;
        "Country": string;
        "Department": string;
        "Distinguished Name": string;
        "Groups": string;
        "Last Login": string;
        "LastLogonTime": string;
        "Location": string;
        "Mail": string;
        "Manager": string;
        "NETBIOS Name": string;
        "Name": string;
        "Object Class": string;
        "Primary Group ID": string;
        "SAM Account Name": string;
        "SID": string;
        "Title": string;
        "Unique Identifier": string;
        "User Principal Name": string;
        "UserAccountControl": string;
        "WhenChanged": string;
    };
}
export {};
