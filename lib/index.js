"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const documentdb_1 = require("documentdb");
const lib_1 = require("documentdb/lib");
class DocumentDBClient {
    constructor(host, key, databaseId, collectionId) {
        this.host = host;
        this.key = key;
        this.databaseId = databaseId;
        this.collectionId = collectionId;
        let opts = new lib_1.DocumentBase.ConnectionPolicy();
        opts.DisableSSLVerification = process.env.NODE_ENV == 'development' ? true : false;
        this.client = new documentdb_1.DocumentClient(host, {
            masterKey: key
        }, opts);
    }
    readDocument(idordoc, options) {
        return new Promise((resolve, reject) => {
            try {
                this.client.readDocument(`${this.createDocumentLink(idordoc)}`, options, (error, resource, headers) => {
                    if (error) {
                        switch (error.code) {
                            case 404:
                                return resolve({ resource: null, etag: null, headers });
                            default:
                                return reject(this.transformError(error));
                        }
                    }
                    resolve({ resource: this.makeEntity(resource), etag: resource._etag, headers });
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    /**
     * Query for the documents
     * @param query
     * @param options
     */
    queryDocuments(query, options) {
        return new Promise((resolve, reject) => {
            try {
                let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options);
                iterator.executeNext((error, resources, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    resolve({
                        resources: resources.map(r => this.makeEntity(r)),
                        continuationToken: iterator.hasMoreResults ? headers['x-ms-continuation'] : null,
                        headers
                    });
                });
            }
            catch (ex) {
                reject(ex);
            }
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
                this.client.createDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    resolve({ resource: this.makeEntity(resource), headers });
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
    updateDocument(document, options) {
        return new Promise(async (resolve, reject) => {
            try {
                if (document.id == null)
                    throw new Error(`Document is missing property id`);
                for (let retry = 0; retry < 4; retry++) {
                    let { resource, etag } = await this.readDocument(document.id, options);
                    if (resource == null)
                        throw new Error(`Document "${this.createDocumentLink(document)}" does not exist.`);
                    let newDocument = Object.assign({}, resource, document);
                    try {
                        let { resource: newResource, headers } = await this.replaceDocument(newDocument, Object.assign(options, {
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
    replaceDocument(document, options) {
        return new Promise((resolve, reject) => {
            try {
                this.client.replaceDocument(this.createDocumentLink(document), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    resolve({
                        resource: this.makeEntity(resource),
                        headers
                    });
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
    upsertDocument(document, options) {
        return new Promise((resolve, reject) => {
            try {
                this.client.upsertDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if (error)
                        return reject(this.transformError(error));
                    resolve({
                        resource: this.makeEntity(resource),
                        headers
                    });
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    /**
     * Deletes a document
     * @param document
     */
    deleteDocument(document) {
        return new Promise((resolve, reject) => {
            try {
                this.client.deleteDocument(this.createDocumentLink(document), (error, resource, headers) => {
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
    createDatabaseLink() {
        return documentdb_1.UriFactory.createDatabaseUri(this.databaseId);
    }
    createCollectionLink() {
        return documentdb_1.UriFactory.createDocumentCollectionUri(this.databaseId, this.collectionId);
    }
    createDocumentLink(document) {
        return documentdb_1.UriFactory.createDocumentUri(this.databaseId, this.collectionId, typeof document == 'object' ? document.id : document);
    }
    makeEntity(doc) {
        return this.makeDocument(doc);
    }
    makeDocument(resource) {
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
}
exports.default = DocumentDBClient;
//# sourceMappingURL=index.js.map