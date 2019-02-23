import { ENTRYPOINT } from "./common";
import { coreClass, coreOptions, coreStats } from "./core";
interface dssDomain {
    "dn": string;
    "dns": string;
    "netbios": string;
    "status": {
        "statusText": string;
        "statusUpdateTime": number;
        "syncUpdateTime": number;
    };
}
interface dssQuery {
    domainName: string;
    lastSyncTmp?: number;
    syncUpdateTime?: number;
    objects?: any[];
    directoryEntries?: any[];
}
interface dssResponseQuery {
    count: number;
    pageNumber: number;
    pageSize: number;
    unreadResults?: number;
    result: dssQuery[];
}
export interface dssStats extends coreStats {
    queries: number;
    domainCall: number;
    attributeCall: number;
    countCall: number;
}
interface dssQueryFilter {
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
export declare class DirectorySyncService extends coreClass {
    protected stats: dssStats;
    private dssAttrMap;
    private constructor();
    static factory(entryPoint: ENTRYPOINT, ops: coreOptions): Promise<DirectorySyncService>;
    private fetcher;
    attributes(): Promise<DSSAttributeMap>;
    domains(): Promise<dssDomain[]>;
    count(domain: string, objClass: DSSObjClass): Promise<number>;
    query(objClass: DSSObjClass, query?: dssQueryFilter | {}): Promise<dssResponseQuery>;
}
export declare type DSSObjClass = "containers" | "computers" | "ous" | "groups" | "users";
export interface DSSAttributeMap {
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
