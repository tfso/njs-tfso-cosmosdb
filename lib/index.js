"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
Symbol.asyncIterator = Symbol.asyncIterator || "__@@asyncIterator__";
const documentdb_1 = require("documentdb");
const lib_1 = require("documentdb/lib");
const Constants = require("documentdb/lib/constants");
class DocumentDBClient {
    constructor(host, key, databaseId, collectionId) {
        this.host = host;
        this.key = key;
        this.databaseId = databaseId;
        this.collectionId = collectionId;
        this._washDocuments = true;
    }
    get policy() {
        if (this._policy == null) {
            this._policy = new lib_1.DocumentBase.ConnectionPolicy();
            if (process.env.NODE_ENV == 'development')
                this._policy.DisableSSLVerification = true;
        }
        return this._policy;
    }
    get washDocuments() {
        return this.washDocuments;
    }
    set washDocuments(value) {
        this._washDocuments = !!value;
    }
    /**
     * Fetches entities from an asynchronious iterator
     * @param iterator an async iterable iterator
     * @param quantity number of items to fetch, any number below zero will fetch all
     */
    static async fromAsyncIterable(iterator, quantity = 100) {
        let entities = new Array(), idx = 0;
        do {
            let result = await iterator.next();
            if (result.done || (quantity >= 0 && quantity <= idx++))
                break;
            entities.push(result.value);
        } while (true);
        return entities;
    }
    readDocument(idordoc, options = undefined) {
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options);
                this.client.readDocument(`${this.createDocumentLink(idordoc)}`, options, (error, resource, headers) => {
                    if (error) {
                        switch (error.code) {
                            case 404:
                                return resolve({ resource: null, etag: null, headers });
                            default:
                                return reject(this.transformError(error));
                        }
                    }
                    try {
                        resolve({ resource: this.makeEntity(resource), etag: resource._etag, headers });
                    }
                    catch (ex) {
                        reject(ex);
                    }
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Query for the documents with paging using ContinuationToken
     * @param query
     * @param options
     */
    queryDocuments(query, options) {
        return new Promise(async (resolve, reject) => {
            try {
                this.validateOptions(options);
                let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options);
                let { resources, headers } = await this.executeNext(iterator);
                resolve({
                    resources,
                    continuationToken: resources !== undefined ? headers['x-ms-continuation'] : null,
                    headers
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Iterate through documents asynchronious with `for await()`
     * @param query
     * @param options
     */
    iterateDocuments(query, options) {
        return tslib_1.__asyncGenerator(this, arguments, function* iterateDocuments_1() {
            this.validateOptions(options);
            let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options);
            do {
                let { resources, headers } = yield tslib_1.__await(this.executeNext(iterator));
                if (resources === undefined)
                    break;
                yield tslib_1.__await(yield* tslib_1.__asyncDelegator(tslib_1.__asyncValues(resources)));
            } while (true);
        });
    }
    /**
     * Creates a new document that doesn't exists.
     * @param document
     * @param options
     */
    createDocument(document, options = undefined) {
        return new Promise((resolve, reject) => {
            try {
                let opts = Object.assign({}, options);
                this.validateOptions(options);
                this.client.createDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    try {
                        resolve({ resource: this.makeEntity(resource), headers });
                    }
                    catch (ex) {
                        reject(ex);
                    }
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up.
     * @param document
     * @param options
     */
    updateDocument(document, options = undefined) {
        return new Promise(async (resolve, reject) => {
            try {
                if (document.id == null)
                    throw new Error(`Document is missing property id`);
                this.validateOptions(options);
                for (let retry = 0; retry < 4; retry++) {
                    let { resource, etag } = await this.readDocument(document.id, options);
                    if (resource == null)
                        throw new Error(`Document "${this.createDocumentLink(document)}" does not exist.`);
                    let newDocument = Object.assign({}, resource, document);
                    try {
                        let { resource: newResource, headers } = await this.replaceDocument(newDocument, Object.assign(options || {}, {
                            accessCondition: { type: 'IfMatch', condition: etag }
                        }));
                        return { resource: newResource, headers };
                    }
                    catch (ex) {
                        if (ex.statusCode != 412 || retry == 4)
                            throw ex;
                        // try again but wait a bit
                        await this.delay(100 + (200 * (retry - 1)));
                    }
                }
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Replaces a document that exists.
     * @param document
     * @param options
     */
    replaceDocument(document, options = undefined) {
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options);
                this.client.replaceDocument(this.createDocumentLink(document), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    try {
                        resolve({
                            resource: this.makeEntity(resource),
                            headers
                        });
                    }
                    catch (ex) {
                        reject(ex);
                    }
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Creates a new document or replacing it if it exists
     * @param document
     * @param options
     */
    upsertDocument(document, options = undefined) {
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options);
                this.client.upsertDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    try {
                        resolve({
                            resource: this.makeEntity(resource),
                            headers
                        });
                    }
                    catch (ex) {
                        reject(ex);
                    }
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    deleteDocument(idordoc, options = undefined) {
        return new Promise((resolve, reject) => {
            try {
                this.client.deleteDocument(this.createDocumentLink(idordoc), options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    resolve({
                        resource: null,
                        headers
                    });
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    get client() {
        if (this._client == null)
            this._client = new documentdb_1.DocumentClient(this.host, {
                masterKey: this.key
            }, this.policy);
        return this._client;
    }
    createDatabaseLink() {
        return documentdb_1.UriFactory.createDatabaseUri(this.databaseId);
    }
    createCollectionLink() {
        return documentdb_1.UriFactory.createDocumentCollectionUri(this.databaseId, this.collectionId);
    }
    createDocumentLink(document) {
        return documentdb_1.UriFactory.createDocumentUri(this.databaseId, this.collectionId, typeof document == 'object' ? document.id : document);
    }
    executeNext(iterator) {
        return new Promise((resolve, reject) => {
            try {
                iterator.executeNext((error, resources, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    if (error === undefined && resources === undefined)
                        return resolve({ resources: undefined, headers: undefined });
                    resolve({
                        resources: resources.map(r => this.makeEntity(r)),
                        headers
                    });
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    makeEntity(doc) {
        return this.makeDocument(doc);
    }
    makeDocument(resource) {
        if (typeof resource != 'object' || resource == null)
            return null;
        if (this._washDocuments == false)
            return resource;
        let document = { id: resource.id };
        for (let propertyName of Object.getOwnPropertyNames(resource)) {
            switch (propertyName) {
                case '_rid':
                case '_self':
                case '_etag':
                case '_attachments':
                case '_ts':
                    break;
                default:
                    document[propertyName] = resource[propertyName];
                    break;
            }
        }
        return document;
    }
    delay(ms = 1000) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, Number(ms) || 1000);
        });
    }
    transformError(err) {
        try {
            if (err.message == null) {
                let json = typeof err.body == 'string' ? JSON.parse(err.body) : err;
                if (json && json.message)
                    [err.message] = json.message.split(/\r\n/);
            }
        }
        catch (ex) {
        }
        return err;
    }
    validateOptions(options) {
        for (let [key, value] of Object.entries(this.getHeaders(options))) {
            if (value === undefined)
                throw new TypeError(`Invalid value "${value}" for header "${key}"`);
        }
    }
    getHeaders(options) {
        var headers = {};
        options = options || {};
        if (options.continuation) {
            headers[Constants.HttpHeaders.Continuation] = options.continuation;
        }
        if (options.preTriggerInclude) {
            headers[Constants.HttpHeaders.PreTriggerInclude] = options.preTriggerInclude.constructor === Array ? options.preTriggerInclude.join(",") : options.preTriggerInclude;
        }
        if (options.postTriggerInclude) {
            headers[Constants.HttpHeaders.PostTriggerInclude] = options.postTriggerInclude.constructor === Array ? options.postTriggerInclude.join(",") : options.postTriggerInclude;
        }
        if (options.offerType) {
            headers[Constants.HttpHeaders.OfferType] = options.offerType;
        }
        if (options.offerThroughput) {
            headers[Constants.HttpHeaders.OfferThroughput] = options.offerThroughput;
        }
        if (options.maxItemCount) {
            headers[Constants.HttpHeaders.PageSize] = options.maxItemCount;
        }
        if (options.accessCondition) {
            if (options.accessCondition.type === "IfMatch") {
                headers[Constants.HttpHeaders.IfMatch] = options.accessCondition.condition;
            }
            else {
                headers[Constants.HttpHeaders.IfNoneMatch] = options.accessCondition.condition;
            }
        }
        if (options.indexingDirective) {
            headers[Constants.HttpHeaders.IndexingDirective] = options.indexingDirective;
        }
        // TODO: add consistency level validation.
        if (options.consistencyLevel) {
            headers[Constants.HttpHeaders.ConsistencyLevel] = options.consistencyLevel;
        }
        if (options.resourceTokenExpirySeconds) {
            headers[Constants.HttpHeaders.ResourceTokenExpiry] = options.resourceTokenExpirySeconds;
        }
        // TODO: add session token automatic handling in case of session consistency.
        if (options.sessionToken) {
            headers[Constants.HttpHeaders.SessionToken] = options.sessionToken;
        }
        if (options.enableScanInQuery) {
            headers[Constants.HttpHeaders.EnableScanInQuery] = options.enableScanInQuery;
        }
        if (options.enableCrossPartitionQuery) {
            headers[Constants.HttpHeaders.EnableCrossPartitionQuery] = options.enableCrossPartitionQuery;
        }
        if (options.maxDegreeOfParallelism != undefined) {
            headers[Constants.HttpHeaders.ParallelizeCrossPartitionQuery] = true;
        }
        if (options.populateQuotaInfo) {
            headers[Constants.HttpHeaders.PopulateQuotaInfo] = true;
        }
        if (options.enableScriptLogging) {
            headers[Constants.HttpHeaders.EnableScriptLogging] = options.enableScriptLogging;
        }
        if (options.offerEnableRUPerMinuteThroughput) {
            headers[Constants.HttpHeaders.OfferIsRUPerMinuteThroughputEnabled] = true;
        }
        if (options.disableRUPerMinuteUsage) {
            headers[Constants.HttpHeaders.DisableRUPerMinuteUsage] = true;
        }
        return headers;
    }
}
exports.default = DocumentDBClient;
//# sourceMappingURL=index.js.map