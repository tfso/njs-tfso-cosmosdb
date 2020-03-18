"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
if (!Symbol.asyncIterator)
    Symbol.asyncIterator = Symbol.asyncIterator || "__@@asyncIterator__";
const cosmos_1 = require("@azure/cosmos");
class DocumentDBClient {
    constructor(host, key, databaseId, collectionId) {
        this.host = host;
        this.key = key;
        this.databaseId = databaseId;
        this.collectionId = collectionId;
        this.offerReserved = false;
        this._washDocuments = true;
    }
    get policy() {
        if (this._policy == null) {
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
    async readDocument(idordoc, options) {
        try {
            let item = this.client.database(this.databaseId).container(this.collectionId).item(typeof idordoc == 'object' ? idordoc.id : idordoc, options && options.partitionKey || undefined);
            if (item) {
                let { resource, headers, etag } = await item.read(options);
                return {
                    resource: this.makeEntity(resource),
                    etag: this.fixEtag(etag),
                    headers
                };
            }
            return { resource: null, etag: null, headers: {} };
        }
        catch (ex) {
            throw ex;
        }
    }
    /**
     * Query for the documents with paging using ContinuationToken
     * @param query
     * @param options
     */
    async queryDocuments(query, options) {
        let iterator = this.client.database(this.databaseId).container(this.collectionId).items.query(query, options);
        let _a = await iterator.fetchNext(), { resources, continuationToken } = _a, rest = __rest(_a, ["resources", "continuationToken"]);
        return {
            resources: resources.map(resource => this.makeEntity(resource)),
            continuationToken,
            headers: rest['headers']
        };
    }
    /**
     * Iterate through documents asynchronious with `for await()`
     * @param query
     * @param options
     */
    iterateDocuments(query, options) {
        return __asyncGenerator(this, arguments, function* iterateDocuments_1() {
            let iterator = this.client.database(this.databaseId).container(this.collectionId).items.query(query, options);
            do {
                let { resources } = yield __await(iterator.fetchNext());
                if (resources === undefined)
                    break;
                yield __await(yield* __asyncDelegator(__asyncValues(resources)));
            } while (true);
        });
    }
    /**
     * Creates a new document that doesn't exists.
     * @param document
     * @param options
     */
    async createDocument(document, options) {
        let { resource, etag, headers } = await this.client.database(this.databaseId).container(this.collectionId).items.create(document, options);
        return {
            resource,
            etag: this.fixEtag(etag),
            headers
        };
    }
    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up.
     * @param document
     * @param options
     */
    async updateDocument(document, options) {
        if (document.id == null)
            throw new Error(`Document is missing property id`);
        for (let retry = 0; retry < 4; retry++) {
            let item = this.client.database(this.databaseId).container(this.collectionId).item(document.id, options && options.partitionKey || undefined);
            let { resource, etag, statusCode } = await item.read(options);
            if (statusCode == 404)
                throw new Error(`Document ${document.id} does not exist.`);
            let newDocument = this.apply(resource, document);
            try {
                let { resource: newResource, etag: newEtag, headers, statusCode } = await item.replace(newDocument, Object.assign(options || {}, {
                    accessCondition: { type: 'IfMatch', condition: etag }
                }));
                if (statusCode == 200)
                    return {
                        resource: this.makeEntity(newResource),
                        etag: this.fixEtag(newEtag),
                        headers
                    };
                throw { statusCode };
            }
            catch (ex) {
                if (ex.code != 412 || retry == 4)
                    throw ex;
                // try again but wait a bit
                await this.delay(100 + (200 * (retry - 1)));
            }
        }
    }
    /**
     * Replaces a document that exists.
     * @param document
     * @param options
     */
    async replaceDocument(document, options) {
        let item = this.client.database(this.databaseId).container(this.collectionId).item(document.id, options && options.partitionKey || undefined);
        let { resource, etag } = await item.read(options);
        if (resource == null)
            throw new Error(`Document ${document.id} does not exist.`);
        let newDocument = this.apply(resource, document);
        let { resource: newResource, etag: newEtag, headers } = await item.replace(newDocument, options);
        return {
            resource: this.makeEntity(newResource),
            etag: this.fixEtag(newEtag),
            headers
        };
    }
    /**
     * Creates a new document or replacing it if it exists
     * @param document
     * @param options
     */
    async upsertDocument(document, options) {
        let { resource, headers, etag } = await this.client.database(this.databaseId).container(this.collectionId).items.upsert(document, options);
        return {
            resource: this.makeEntity(resource),
            etag: this.fixEtag(etag),
            headers
        };
    }
    async deleteDocument(idordoc, options) {
        let item = this.client.database(this.databaseId).container(this.collectionId).item(typeof idordoc == 'object' ? idordoc.id : idordoc, options && options.partitionKey || undefined);
        let { resource, headers, statusCode } = await item.delete(options);
        if (statusCode == 404)
            return { resource: null, headers };
        return { resource, headers };
    }
    /**
     * Get the current throughput (RU/s)
     */
    async getThroughput() {
        return new Promise(async (resolve, reject) => {
            try {
                let offer = await this.getOffer();
                if (!offer.content)
                    throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                resolve(offer.content.offerThroughput);
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Set the throughput (RU/s) to any number between 400 and 10000
     * @param value RU/s
     */
    async setThroughput(value) {
        return new Promise(async (resolve, reject) => {
            try {
                if (value < 400)
                    value = 400;
                if (await this.reserveOffer() == true) {
                    let offer = await this.getOffer();
                    if (!offer.content)
                        throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                    offer.content.offerThroughput = value;
                    let { statusCode } = await this.client.offer(offer.id).replace(offer);
                    this.offerReserved = false;
                    return statusCode == 200;
                }
                else {
                    this.offerReserved = false;
                    return false;
                }
            }
            catch (ex) {
                this.offerReserved = false;
                throw ex;
            }
        });
    }
    /**
     * Increase the throughput (RU/s), defaults to 200
     * @param value RU/s
     */
    async increaseThroughput(value = 200, max = 10000) {
        try {
            if (value < 0)
                value = 200;
            if (await this.reserveOffer() == true) {
                let offer = await this.getOffer();
                if (!offer.content)
                    throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                offer.content.offerThroughput = Math.min((offer.content.offerThroughput + value), Number(max) || 10000);
                let { statusCode } = await this.client.offer(offer.id).replace(offer);
                this.offerReserved = false;
                return statusCode == 200 ? offer.content.offerThroughput : undefined;
            }
            else {
                this.offerReserved = false;
                return undefined;
            }
        }
        catch (ex) {
            this.offerReserved = false;
            throw ex;
        }
    }
    /**
     * Decrease the throughput (RU/s), defaults to 200. Will never go below 400
     * @param value RU/s
     */
    async decreaseThroughput(value = 200) {
        return new Promise(async (resolve, reject) => {
            try {
                if (value < 0)
                    value = 200;
                if (await this.reserveOffer() == true) {
                    let offer = await this.getOffer();
                    if (!offer.content)
                        throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                    offer.content.offerThroughput = Math.max(offer.content.offerThroughput - value, 400);
                    let { statusCode } = await this.client.offer(offer.id).replace(offer);
                    this.offerReserved = false;
                    return statusCode == 200 ? offer.content.offerThroughput : undefined;
                }
                else {
                    this.offerReserved = false;
                    return undefined;
                }
            }
            catch (ex) {
                this.offerReserved = false;
                throw ex;
            }
        });
    }
    fixEtag(value) {
        let match = /^\"?([^"]*)\"?$/.exec(value || '');
        if (match)
            return match[1];
        return value;
    }
    reserveOffer(timeout = 15000) {
        return new Promise((resolve, reject) => {
            let time = timeout, interval = 50, thread = setInterval(() => {
                if (this.offerReserved == false) {
                    clearTimeout(thread);
                    resolve(true);
                }
                else if ((time -= interval) < 0) {
                    clearTimeout(thread);
                    resolve(false);
                }
            }, interval);
        });
    }
    async getOffer() {
        if (!this.offerSelfLink) {
            let { resource, statusCode } = await this.client.database(this.databaseId).container(this.collectionId).read();
            this.offerSelfLink = resource._self;
        }
        let offers = await this._client.offers.readAll().fetchAll();
        if (offers) {
            let offer = offers.resources.find(resource => resource.resource == this.offerSelfLink);
            if (!offer)
                throw new Error(`Offer for collection "${this.collectionId}" is not found`);
            return offer;
        }
        return null;
    }
    get client() {
        if (this._client == null) {
            this._client = new cosmos_1.CosmosClient(`AccountEndpoint=${this.host};AccountKey=${this.key};`);
            // this.policy
        }
        return this._client;
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
    apply(target, source) {
        let targetProto = this.isClass(target) == true ? Object.getPrototypeOf(target) : target, sourceProto = this.isClass(source) == true ? Object.getPrototypeOf(source) : source, destination = Object.assign({}, target);
        for (let property of Object.getOwnPropertyNames(sourceProto)) {
            if (source[property] === undefined)
                continue;
            if (targetProto.hasOwnProperty(property)) {
                if (target[property] !== undefined && target[property] !== null) {
                    switch (target[property].constructor) {
                        case Function:
                            break;
                        case Array:
                        case Date:
                        case Boolean:
                        case Number:
                        case String:
                            destination[property] = source[property];
                            break;
                        case Object:
                        default:
                            destination[property] = this.apply(destination[property], source[property]);
                            break;
                    }
                    continue;
                }
            }
            destination[property] = source[property];
        }
        return destination;
    }
    isClass(obj) {
        const isCtorClass = obj.constructor && obj.constructor.toString().substring(0, 5) === 'class';
        if (obj.prototype === undefined)
            return isCtorClass;
        const isPrototypeCtorClass = obj.prototype.constructor
            && obj.prototype.constructor.toString
            && obj.prototype.constructor.toString().substring(0, 5) === 'class';
        return isCtorClass || isPrototypeCtorClass;
    }
}
exports.default = DocumentDBClient;
//# sourceMappingURL=index.js.map