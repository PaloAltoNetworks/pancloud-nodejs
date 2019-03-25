"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
function isEvent(x) {
    return ('time_generated' in x) && ('sessionid' in x);
}
function isL3Event(x) {
    return isEvent(x) && ('src' in x) && ('dst' in x);
}
function isL2Event(x) {
    return isEvent(x) && ('extended-traffic-log-mac' in x) && ('extended-traffic-log-mac-stc' in x);
}
class MacCorrelator {
    constructor(ageout = 120, absoluteTime = false, gbMultiplier = 0) {
        this.ageout = ageout;
        this.absoluteTime = absoluteTime;
        this.gbAttempt = 0;
        this.gbMultiplier = gbMultiplier;
        this.db = [];
        this.lastTs = 0;
        this.stats = {
            agedOut: 0,
            dbWaterMark: 0,
            dbInserts: 0,
            discardedEvents: 0
        };
    }
    gb() {
        this.gbAttempt++;
        if (this.gbAttempt > this.gbMultiplier) {
            this.gbAttempt = 0;
            let fromTs = this.lastTs;
            if (this.absoluteTime) {
                fromTs = Math.floor(Date.now() / 1000);
            }
            fromTs = fromTs - this.ageout;
            let pointer = 0;
            this.db.sort((a, b) => a.ts - b.ts).every((x, i) => {
                pointer = i;
                return x.ts < fromTs;
            });
            if (pointer) {
                let collected = this.db.slice(0, pointer);
                this.db = this.db.slice(pointer);
                this.stats.agedOut += collected.length;
                return collected;
            }
        }
        return null;
    }
    update(dbI) {
        if (this.db.length > this.stats.dbWaterMark) {
            this.stats.dbWaterMark = this.db.length;
        }
        let correlatedEvent;
        if (dbI.ts > this.lastTs) {
            this.lastTs = dbI.ts;
        }
        let collectedItems = this.gb();
        if (dbI.ts < this.lastTs - this.ageout) {
            if (collectedItems) {
                return { noncorr: collectedItems.concat(dbI) };
            }
            return { noncorr: [dbI] };
        }
        let matchIdx = this.db.findIndex(x => x.element.sessionid == dbI.element.sessionid);
        if (matchIdx == -1) {
            this.db.push(dbI);
            this.stats.dbInserts++;
            if (collectedItems) {
                return { noncorr: collectedItems };
            }
            return null;
        }
        let matchedElement = this.db[matchIdx];
        if (isL2Event(matchedElement.element)) {
            if (isL3Event(dbI.element)) {
                correlatedEvent = Object.assign({}, dbI.element, { "extended-traffic-log-mac": matchedElement.element["extended-traffic-log-mac"], "extended-traffic-log-mac-stc": matchedElement.element["extended-traffic-log-mac-stc"] });
                dbI.element = correlatedEvent;
                this.db.splice(matchIdx, 1);
                if (collectedItems) {
                    return { noncorr: collectedItems.concat(matchedElement), corr: dbI };
                }
                else {
                    return { noncorr: [matchedElement], corr: dbI };
                }
            }
        }
        if (isL3Event(matchedElement.element)) {
            if (isL2Event(dbI.element)) {
                correlatedEvent = Object.assign({}, matchedElement.element, { "extended-traffic-log-mac": dbI.element["extended-traffic-log-mac"], "extended-traffic-log-mac-stc": dbI.element["extended-traffic-log-mac-stc"] });
                matchedElement.element = correlatedEvent;
                this.db.splice(matchIdx, 1);
                if (collectedItems) {
                    return { noncorr: collectedItems.concat(dbI), corr: matchedElement };
                }
                else {
                    return { noncorr: [dbI], corr: matchedElement };
                }
            }
        }
        if (collectedItems) {
            return { noncorr: collectedItems.concat(dbI) };
        }
        return { noncorr: [dbI] };
    }
    process(e) {
        if (e.message) {
            let plainResponse = {};
            let corrResponse;
            plainResponse[e.source] = { source: e.source, logType: e.logType, message: [] };
            e.message.forEach(x => {
                if (isEvent(x)) {
                    let ts = parseInt(x.time_generated, 10);
                    if (!isNaN(ts)) {
                        let updateResp = this.update({
                            ts: ts,
                            element: x,
                            meta: {
                                source: e.source,
                                logType: e.logType
                            }
                        });
                        if (updateResp !== null) {
                            if (updateResp.noncorr) {
                                updateResp.noncorr.forEach(y => {
                                    if (y.meta.source in plainResponse) {
                                        plainResponse[y.meta.source].message.push(y);
                                    }
                                    else {
                                        plainResponse[y.meta.source] = {
                                            source: y.meta.source,
                                            logType: y.meta.logType,
                                            message: [y]
                                        };
                                    }
                                });
                            }
                            if (updateResp.corr) {
                                if (corrResponse) {
                                    corrResponse.message.push(updateResp.corr.element);
                                }
                                else {
                                    corrResponse = {
                                        source: e.source,
                                        logType: e.logType,
                                        message: [updateResp.corr.element]
                                    };
                                }
                            }
                        }
                        return;
                    }
                }
                this.stats.discardedEvents++;
                plainResponse[e.source].message.push(x);
            });
            if (corrResponse) {
                return { plain: Object.values(plainResponse), correlated: corrResponse };
            }
            return { plain: Object.values(plainResponse) };
        }
        return { plain: [e] };
    }
    flush() {
        let mapped = this.db.reduce((acc, item) => {
            if (item.meta.source in acc) {
                acc[item.meta.source].message.push(item.element);
            }
            else {
                acc[item.meta.source] = { source: item.meta.source, logType: item.meta.logType, message: [item.element] };
            }
            return acc;
        }, {});
        this.db = [];
        return { plain: Object.values(mapped) };
    }
}
exports.MacCorrelator = MacCorrelator;
