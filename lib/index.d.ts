import { ConnectionPolicy, NewDocument, RequestOptions, DocumentOptions, FeedOptions, SqlQuerySpec } from 'documentdb';
export default class DocumentDBClient<TEntity extends NewDocument> {
    private host;
    private key;
    private databaseId;
    private collectionId;
    private _client;
    private _policy;
    private _washDocuments;
    constructor(host: string, key: string, databaseId: string, collectionId: string);
    readonly policy: ConnectionPolicy;
    washDocuments: boolean;
    /**
     * Fetches entities from an asynchronious iterator
     * @param iterator an async iterable iterator
     * @param quantity number of items to fetch, any number below zero will fetch all
     */
    static fromAsyncIterable<TEntity>(iterator: AsyncIterableIterator<TEntity>, quantity?: number): Promise<TEntity[]>;
    /**
     * Reads a document by its id
     * @param id
     * @param options
     */
    readDocument(id: string, options?: RequestOptions): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Reads a document by its document id
     * @param document
     * @param options
     */
    readDocument(document: TEntity, options?: RequestOptions): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Query for the documents with paging using ContinuationToken
     * @param query
     * @param options
     */
    queryDocuments(query: string | SqlQuerySpec, options?: FeedOptions): Promise<{
        resources: TEntity[];
        continuationToken: string;
        headers: any;
    }>;
    /**
     * Iterate through documents asynchronious with `for await()`
     * @param query
     * @param options
     */
    iterateDocuments(query: string | SqlQuerySpec, options?: FeedOptions): AsyncIterableIterator<TEntity>;
    /**
     * Creates a new document that doesn't exists.
     * @param document
     * @param options
     */
    createDocument(document: TEntity, options?: DocumentOptions): Promise<{
        resource: TEntity;
        headers: any;
    }>;
    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up.
     * @param document
     * @param options
     */
    updateDocument(document: Partial<TEntity>, options?: RequestOptions): Promise<{
        resource: TEntity;
        headers: any;
    }>;
    /**
     * Replaces a document that exists.
     * @param document
     * @param options
     */
    replaceDocument(document: TEntity, options?: RequestOptions): Promise<{
        resource: TEntity;
        headers: any;
    }>;
    /**
     * Creates a new document or replacing it if it exists
     * @param document
     * @param options
     */
    upsertDocument(document: TEntity, options?: DocumentOptions): Promise<{
        resource: TEntity;
        headers: any;
    }>;
    /**
     * Deletes a document by its document id
     * @param document
     */
    deleteDocument(document: TEntity, options?: RequestOptions): Promise<{
        resource: void;
        headers: any;
    }>;
    /**
     * Deletes a document by its id
     * @param id
     */
    deleteDocument(id: string, options?: RequestOptions): Promise<{
        resource: void;
        headers: any;
    }>;
    private readonly client;
    private createDatabaseLink();
    private createCollectionLink();
    private createDocumentLink(id);
    private createDocumentLink(document);
    private executeNext(iterator);
    private makeEntity<T>(doc);
    private makeDocument(resource);
    private makeDocument(resource);
    private makeDocument(resource);
    private delay(ms?);
    private transformError(err);
    private validateOptions(options);
    private getHeaders(options);
    private getHeaders(options);
    private getHeaders(options);
}
