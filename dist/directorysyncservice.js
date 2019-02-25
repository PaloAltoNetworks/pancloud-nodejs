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
class DirectorySyncService extends core_1.CoreClass {
    constructor(entryPoint, ops) {
        super(entryPoint, ops);
        this.className = "DirectorySyncService";
        this.stats = Object.assign({ queries: 0, domainCall: 0, attributeCall: 0, countCall: 0 }, this.stats);
    }
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
    async attributes() {
        this.stats.attributeCall++;
        return this.fetcher('/attributes', isDssResponseAttrMap, x => {
            this.dssAttrMap = x.result;
            return this.dssAttrMap;
        });
    }
    async domains() {
        this.stats.domainCall++;
        return this.fetcher('/domains', isDssResponseDomains, x => x.result);
    }
    async count(domain, objClass) {
        this.stats.countCall++;
        return this.fetcher(`/${objClass}/count?domain=${encodeURIComponent(domain)}`, isDssResponseCount, x => x.result.count);
    }
    async query(objClass, query = {}) {
        this.stats.queries++;
        return this.fetcher(`/${objClass}`, isDssResponseQuery, x => x, query);
    }
}
exports.DirectorySyncService = DirectorySyncService;
function isDSSAttributeMap(obj) {
    return true;
}
