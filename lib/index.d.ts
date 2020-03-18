import { CosmosClient, ItemDefinition, ConnectionPolicy, SqlQuerySpec, FeedOptions, RequestOptions } from '@azure/cosmos';
export default class DocumentDBClient<TEntity extends ItemDefinition> {
    private host;
    private key;
    private databaseId;
    private collectionId;
    private _client;
    private _policy;
    private offerSelfLink;
    private offerReserved;
    private _washDocuments;
    constructor(host: string, key: string, databaseId: string, collectionId: string);
    get policy(): ConnectionPolicy;
    get washDocuments(): boolean;
    set washDocuments(value: boolean);
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
    readDocument(id: string, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Reads a document by its document id
     * @param document
     * @param options
     */
    readDocument(document: TEntity, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
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
    createDocument(document: TEntity, options?: RequestOptions): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up.
     * @param document
     * @param options
     */
    updateDocument(document: Partial<TEntity>, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Replaces a document that exists.
     * @param document
     * @param options
     */
    replaceDocument(document: TEntity, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Creates a new document or replacing it if it exists
     * @param document
     * @param options
     */
    upsertDocument(document: TEntity, options?: RequestOptions): Promise<{
        resource: TEntity;
        etag: string;
        headers: any;
    }>;
    /**
     * Deletes a document by its document id
     * @param document
     */
    deleteDocument(document: TEntity, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
        resource: void;
        headers: any;
    }>;
    /**
     * Deletes a document by its id
     * @param id
     */
    deleteDocument(id: string, options?: RequestOptions & {
        partitionKey?: string;
    }): Promise<{
        resource: void;
        headers: any;
    }>;
    /**
     * Get the current throughput (RU/s)
     */
    getThroughput(): Promise<number>;
    /**
     * Set the throughput (RU/s) to any number between 400 and 10000
     * @param value RU/s
     */
    setThroughput(value: number): Promise<boolean>;
    /**
     * Increase the throughput (RU/s), defaults to 200
     * @param value RU/s
     */
    increaseThroughput(value?: number, max?: number): Promise<number>;
    /**
     * Decrease the throughput (RU/s), defaults to 200. Will never go below 400
     * @param value RU/s
     */
    decreaseThroughput(value?: number): Promise<number>;
    private fixEtag;
    private reserveOffer;
    private getOffer;
    protected get client(): CosmosClient;
    private makeEntity;
    private makeDocument;
    private delay;
    private transformError;
    private apply;
    private isClass;
}
export { ItemDefinition as Document };
