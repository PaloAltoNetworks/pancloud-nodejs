"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = require("url");
const core_1 = require("./core");
const exceptions_1 = require("./exceptions");
const DSS_PATH = "directory-sync-service/v1";
function isDssDomain(obj) {
    return obj.dn && typeof obj.dn == 'string' &&
        obj.dns && typeof obj.dns == 'string' &&
        obj.netbios && typeof obj.netbios == 'string' &&
        obj.status && typeof obj.status == 'object' &&
        obj.status.statusText && typeof obj.status.statusText == 'string' &&
        obj.status.statusUpdateTime && typeof obj.status.statusUpdateTime == 'number' &&
        obj.status.syncUpdateTime && typeof obj.status.syncUpdateTime == 'number';
}
function isDssResponseDomains(obj) {
    if (obj.result && typeof obj.result == 'object' && Array.isArray(obj.result)) {
        return obj.result.every(x => isDssDomain(x));
    }
    return false;
}
function isDssResponseAttrMap(obj) {
    if (obj.result && typeof obj.result == 'object') {
        return isDSSAttributeMap(obj.result);
    }
    return false;
}
function isDssResponseCount(obj) {
    if (obj.result && typeof obj.result == 'object') {
        return obj.result.count && typeof obj.result.count == 'number';
    }
    return false;
}
function isDssQuery(obj) {
    return obj.domainName && typeof obj.domainName == 'string' &&
        (!('lastSyncTmp' in obj) || typeof obj.lastSyncTmp == 'number') &&
        (!('syncUpdateTime' in obj) || typeof obj.syncUpdateTime == 'number') &&
        (!('objects' in obj) || (typeof obj.objects == 'object' && Array.isArray(obj.objects))) &&
        (!('directoryEntries' in obj) || (typeof obj.directoryEntries == 'object' && Array.isArray(obj.directoryEntries)));
}
function isDssResponseQuery(obj) {
    if (obj.result && typeof obj.result == 'object' && Array.isArray(obj.result) &&
        obj.count && typeof obj.count == 'number' &&
        obj.pageNumber && typeof obj.pageNumber == 'number' &&
        obj.pageSize && typeof obj.pageSize == 'number' &&
        (!(obj.unreadResults) || typeof obj.unreadResults == 'number')) {
        return obj.result.every(x => isDssQuery(x));
    }
    return false;
}
/**
 * Implements a client to the Application Framework Directory Sync Services API
 */
class DirectorySyncService extends core_1.CoreClass {
    /**
     * Constructor is private. Use the **DirectorySyncService.factory()** method instead
     */
    constructor(entryPoint, ops) {
        super(entryPoint, ops);
        this.className = "DirectorySyncService";
        this.stats = Object.assign({ queryCalls: 0, domainCalls: 0, attributeCalls: 0, countCalls: 0 }, this.stats);
    }
    /**
     * Factory method to return an instantiated **DirectorySyncService** object
     * @param entryPoint a **string** with a valid entry point to the Application Framework API (US/EU)
     * @param ops configuration object
     */
    static async factory(entryPoint, ops) {
        return new DirectorySyncService(new url_1.URL(DSS_PATH, entryPoint).toString(), ops);
    }
    async fetcher(path, checker, action, query) {
        let res;
        if (query) {
            res = await this.fetchPostWrap(path, JSON.stringify(query));
        }
        else {
            res = await this.fetchGetWrap(path);
        }
        if (checker(res)) {
            return action(res);
        }
        throw new exceptions_1.PanCloudError(`Invalid schema in the response received: ${JSON.stringify(res)}`);
    }
    /**
     * Get Directory Attribute Map
     * @returns the attribute map for this customer's directory
     */
    async attributes() {
        this.stats.attributeCalls++;
        return this.fetcher('/attributes', isDssResponseAttrMap, x => x.result);
    }
    /**
     * Get the list of domains managed by this agent
     * @returns the list of domains
     */
    async domains() {
        this.stats.domainCalls++;
        return this.fetcher('/domains', isDssResponseDomains, x => x.result);
    }
    /**
     * Get the number of elements of a specific object class in a given domain
     * @param domain domain name
     * @param objClass a valid **string** in the type *DssObjClass*
     * @returns the number of entries for the provided object class and domain
     */
    async count(domain, objClass) {
        this.stats.countCalls++;
        return this.fetcher(`/${objClass}/count?domain=${encodeURIComponent(domain)}`, isDssResponseCount, x => x.result.count);
    }
    /**
     * Perform a Directory Sync Services Query
     * @param objClass a valid **string** in the type *DssObjClass*
     * @param query object describing the query to be performed
     * @returns the response objecct
     */
    async query(objClass, query) {
        this.stats.queryCalls++;
        return this.fetcher(`/${objClass}`, isDssResponseQuery, x => x, (query) ? query : {});
    }
    /**
     * Statistics getter
     * @returns runtime statistics for this instance
     */
    getDssStats() {
        return this.stats;
    }
}
exports.DirectorySyncService = DirectorySyncService;
function isDSSAttributeMap(obj) {
    return true;
}
