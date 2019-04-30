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
/**
 * Implements the abstract coreClass that implements common methods for higher-end classes like Event Service
 * and Logging Service
 */
const url_1 = require("url");
const fetch_1 = require("./fetch");
const error_1 = require("./error");
const common_1 = require("./common");
/**
 * This class should not be used directly. It is meant to be extended. Use higher-level classes like LoggingService
 * or EventService
 */
class CoreClass {
    /**
     *
     * @param cred credentials object instance that will provide the needed JWT access_token
     * @param ops configuration options for this instance
     */
    constructor(cred, basePath, ops) {
        this.className = "coreClass";
        this.cred = cred;
        this.baseUrl = new url_1.URL(basePath, cred.getEntryPoint()).toString();
        if (ops && ops.level != undefined && ops.level != common_1.LogLevel.INFO) {
            common_1.commonLogger.level = ops.level;
        }
        this.retrierCount = (ops) ? ops.retrierCount : undefined;
        this.retrierDelay = (ops) ? ops.retrierDelay : undefined;
        this.fetchTimeout = (ops) ? ops.fetchTimeout : undefined;
        this.stats = {
            apiTransactions: 0
        };
    }
    /**
     * Prepares the HTTP headers. Mainly used to keep the Autorization header (bearer access-token)
     */
    async setFetchHeaders() {
        this.fetchHeaders = {
            'Authorization': 'Bearer ' + await this.cred.getAccessToken(),
            'Content-Type': 'application/json'
        };
        common_1.commonLogger.info(this, 'updated authorization header');
    }
    /**
     * Triggers the credential object access-token refresh procedure and updates the HTTP headers
     * DEPRECATED 190429 (rename it to `refresh` if needed)
     */
    async _refresh() {
        await this.cred.retrieveAccessToken();
        await this.setFetchHeaders();
    }
    async checkAutoRefresh() {
        let currentValidUntil = await this.cred.autoRefresh();
        if (this.validUntil != currentValidUntil) {
            this.validUntil = currentValidUntil;
            await this.setFetchHeaders();
        }
    }
    async fetchXWrap(method, path, body) {
        let url = this.baseUrl + ((path) ? path : '');
        this.stats.apiTransactions++;
        await this.checkAutoRefresh();
        if (!this.fetchHeaders) {
            await this.setFetchHeaders();
        }
        let rInit = {
            headers: this.fetchHeaders,
            method: method
        };
        if (this.fetchTimeout) {
            rInit.timeout = this.fetchTimeout;
        }
        if (body) {
            rInit.body = body;
        }
        common_1.commonLogger.debug(this, `fetch operation to ${url}`, method, body);
        let r = await common_1.retrier(this, this.retrierCount, this.retrierDelay, fetch_1.fetch, url, rInit);
        let rText = await r.text();
        if (rText.length == 0) {
            common_1.commonLogger.debug(this, 'fetch response is null');
            return null;
        }
        let rJson;
        try {
            rJson = JSON.parse(rText);
        }
        catch (exception) {
            throw new error_1.PanCloudError(this, 'PARSER', `Invalid JSON: ${exception.message}`);
        }
        if (!r.ok) {
            common_1.commonLogger.alert(this, rText, "FETCHXWRAP");
            throw new error_1.ApplicationFrameworkError(this, rJson);
        }
        common_1.commonLogger.debug(this, 'fetch response', undefined, rJson);
        return rJson;
    }
    /**
     * Convenience method that abstracts a GET operation to the Application Framework. Captures both non JSON responses
     * as well as Application Framework errors (non-200) throwing exceptions in both cases.
     * @param url URL to be called
     * @param timeout milliseconds before issuing a timeout exeception. The operation is wrapped by a 'retrier'
     * that will retry the operation. User can change default retry parameters (3 times / 100 ms) using the right
     * class configuration properties
     * @returns the object returned by the Application Framework
     */
    async fetchGetWrap(path) {
        return await this.fetchXWrap("GET", path, undefined);
    }
    /**
     * Convenience method that abstracts a POST operation to the Application Framework
     */
    async fetchPostWrap(path, body) {
        return await this.fetchXWrap("POST", path, body);
    }
    /**
     * Convenience method that abstracts a PUT operation to the Application Framework
     */
    async fetchPutWrap(path, body) {
        return await this.fetchXWrap("PUT", path, body);
    }
    /**
     * Convenience method that abstracts a DELETE operation to the Application Framework
     */
    async fetchDeleteWrap(path) {
        return await this.fetchXWrap("DELETE", path, undefined);
    }
    /**
     * Convenience method that abstracts a DELETE operation to the Application Framework
     */
    async voidXOperation(path, payload, method = 'POST') {
        let r_json = await this.fetchXWrap(method, path, payload);
        this.lastResponse = r_json;
    }
}
exports.CoreClass = CoreClass;
