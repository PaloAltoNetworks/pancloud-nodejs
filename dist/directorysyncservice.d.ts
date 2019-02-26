import { EntryPoint } from "./common";
import { CoreClass, CoreOptions, CoreStats } from "./core";
interface DssDomain {
    /**
     * domain in distinguished name format
     */
    "dn": string;
    /**
     * domain in DNS format
     */
    "dns": string;
    /**
     * NetBIOS name of the domain
     */
    "netbios": string;
    /**
     * domain's status
     */
    "status": {
        /**
         * textual description of the domain's status
         */
        "statusText": string;
        /**
         * timestamp when the data synchronization job was last successful. This is Unix epoch value in UTC
         */
        "statusUpdateTime": number;
        /**
         * timestamp when this status was last updated. This is a Unix epoch value in UTC
         */
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
    /**
     * Number of **POST** calls to the **\/** entry point
     */
    queryCalls: number;
    /**
     * Number of **GET** calls to the **\/domains** entry point
     */
    domainCalls: number;
    /**
     * Number of **GET** calls to the **\/attributes** entry point
     */
    attributeCalls: number;
    /**
     * Number of **GET** calls to the **\/count** entry point
     */
    countCalls: number;
}
export interface DssQueryFilter {
    /**
     * Identifies the domain from which directory entries are to be fetched. Specify a
     * string in DNS format
     */
    domain: string;
    /**
     * Identifies the directory entries allowed in the result set by specifying a match
     * criteria. The match criteria identifies the allowable attribute and attribute values
     * that must appear on a directory entry in order for it to be included in the result set.
     * Attribute values may be a partial string, in which case matches are based on the
     * **matchCriteria** operator
     */
    name?: {
        /**
         * A **string** with a valid directory entry attribute that you want to match against
         */
        attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name';
        /**
         * Attribute value you want to match. You can supply a
         * partial string to this field. Matches are based on the **matchCriteria** operator
         */
        attributeValue: string;
        /**
         * A **string** with a valid operation name
         */
        matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal';
    };
    /**
     * Filters the query so that only directory entries that conform to the specified match
     * criteria are included in the result set. Filters are only used when retrieving entries
     * of one class (such as a user or computer) that belong to an instance of another class
     */
    filter?: {
        /**
         * the object class type that you want to match against. For example, if you wanted to
         * find all computers that belong to a specific organization, this field would be ou
         */
        type: 'container' | 'ou' | 'group';
        /**
         * **string** that defines the scope of the match. _'immediate'_ to examine only immediate
         * members of the identified group. _'recursive'_ to examine immediate group members, as
         * well as the members of all children (nested) groups
         */
        level: 'immediate' | 'recursive';
        /**
         * Identifies the directory entries allowed in the result set by specifying a match
         * criteria. The match criteria identifies the allowable attribute and attribute values
         * that must appear on a directory entry in order for it to be included in the result set.
         * Attribute values may be a partial string, in which case matches are based on the
         * **matchCriteria** operator
         */
        name: {
            /**
             * A **string** with a valid directory entry attribute that you want to match against
             */
            attributeName: 'Common-Name' | 'Distinguished Name' | 'Name' | 'SAM Account Name' | 'SID' | 'User Principal Name';
            /**
             * Attribute value you want to match. You can supply a
             * partial string to this field. Matches are based on the **matchCriteria** operator
             */
            attributeValue: string;
            /**
             * A **string** with a valid operation name
             */
            matchCriteria: 'startWith' | 'startWith' | 'contain' | 'equal';
        };
    };
    /**
     * Identifies the page number you want retrieved by this query. Page numbers start at 1.
     * Query result sets are split into pages which contain at most pageSize directory entries.
     * If this field is not specified, page number 1 is returned.
     */
    pageNumber?: number;
    /**
     * Identifies the page size you want used for this query. Page size is the number of directory
     * entries you want retrieved per query request. Specify a number between 1 and 1000.
     * The remainingEntries field in the JSON response object contains the number of directory entries
     * existing in the result set past the page specified by this query. For example, if your total query
     * result set contains 500 directory entries, and you specify a page size of 300, then there will
     * be two pages available for the query. You retrieve the first page by specifying a page number of 1.
     * In the response to that query, you will see the remainingEntries field is set to 200. You can then
     * retrieve the last 200 entries by requesting the second page. If this field is not specified,
     * a page size of 500 is used
     */
    pageSize?: number;
}
export declare type DssOptions = CoreOptions;
/**
 * Implements a client to the Application Framework Directory Sync Services API
 */
export declare class DirectorySyncService extends CoreClass {
    /**
     * statistics
     */
    protected stats: DssStats;
    /**
     * Constructor is private. Use the **DirectorySyncService.factory()** method instead
     */
    private constructor();
    /**
     * Factory method to return an instantiated **DirectorySyncService** object
     * @param entryPoint a **string** with a valid entry point to the Application Framework API (US/EU)
     * @param ops configuration object
     */
    static factory(entryPoint: EntryPoint, ops: DssOptions): Promise<DirectorySyncService>;
    private fetcher;
    /**
     * Get Directory Attribute Map
     * @returns the attribute map for this customer's directory
     */
    attributes(): Promise<DssAttributeMap>;
    /**
     * Get the list of domains managed by this agent
     * @returns the list of domains
     */
    domains(): Promise<DssDomain[]>;
    /**
     * Get the number of elements of a specific object class in a given domain
     * @param domain domain name
     * @param objClass a valid **string** in the type *DssObjClass*
     * @returns the number of entries for the provided object class and domain
     */
    count(domain: string, objClass: DssObjClass): Promise<number>;
    /**
     * Perform a Directory Sync Services Query
     * @param objClass a valid **string** in the type *DssObjClass*
     * @param query object describing the query to be performed
     * @returns the response objecct
     */
    query(objClass: DssObjClass, query?: DssQueryFilter): Promise<DssResponseQuery>;
    /**
     * Statistics getter
     * @returns runtime statistics for this instance
     */
    getDssStats(): DssStats;
}
/**
 * keyword values are specified as plurals
 */
export declare type DssObjClass = "containers" | "computers" | "ous" | "groups" | "users";
interface DssAttributeMap {
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
