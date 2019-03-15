if(!Symbol.asyncIterator)
    (Symbol as any).asyncIterator = Symbol.asyncIterator || "__@@asyncIterator__";
    
import { UriFactory, DocumentClient, ConnectionPolicy, NewDocument, RequestOptions, DocumentOptions, RetrievedDocument, FeedOptions, SqlQuerySpec, QueryIterator } from 'documentdb'
import { DocumentBase } from 'documentdb/lib'
import * as Constants from 'documentdb/lib/constants'


export default class DocumentDBClient<TEntity extends NewDocument> {
    private _client: DocumentClient;
    private _policy: ConnectionPolicy;

    private offerSelfLink: string
    private offerReserved: boolean = false

    private _washDocuments: boolean = true

    constructor(private host: string, private key: string, private databaseId: string, private collectionId: string) {
     
    }

    public get policy(): ConnectionPolicy {
        if(this._policy == null) {
            this._policy = new DocumentBase.ConnectionPolicy()

            if(process.env.NODE_ENV == 'development')
                this._policy.DisableSSLVerification = true
        }

        return this._policy
    }

    public get washDocuments(): boolean {
        return this.washDocuments
    }

    public set washDocuments(value: boolean) {
        this._washDocuments = !!value
    }

    /**
     * Fetches entities from an asynchronious iterator
     * @param iterator an async iterable iterator
     * @param quantity number of items to fetch, any number below zero will fetch all
     */
    public static async fromAsyncIterable<TEntity>(iterator: AsyncIterableIterator<TEntity>, quantity: number = 100): Promise<TEntity[]> {
        let entities = new Array<TEntity>(),
            idx = 0

        do {
            let result = await iterator.next()

            if(result.done || (quantity >= 0 && quantity <= idx++))
                break;

            entities.push(result.value)
        }
        while(true)

        return entities;
    }

    /**
     * Reads a document by its id
     * @param id 
     * @param options 
     */
    public readDocument(id: string, options?: RequestOptions): Promise<{resource: TEntity, etag: string, headers: any}>
    /**
     * Reads a document by its document id
     * @param document
     * @param options 
     */
    public readDocument(document: TEntity, options?: RequestOptions): Promise<{resource: TEntity, etag: string, headers: any}>
    public readDocument(idordoc: any, options: RequestOptions = undefined): Promise<{resource: TEntity, etag: string, headers: any}> {        
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options)

                this.client.readDocument(`${this.createDocumentLink(idordoc)}`, options, (error, resource, headers) => {
                    if(error) {
                        switch(error.code) {
                            case 404:
                                return resolve({ resource: null, etag: null, headers })

                            default:
                                return reject(this.transformError(error))
                        }
                    }

                    try {
                        resolve({resource: this.makeEntity(resource), etag: resource._etag, headers})
                    }
                    catch(ex) {
                        reject(ex)
                    }
                })
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Query for the documents with paging using ContinuationToken
     * @param query 
     * @param options 
     */
    public queryDocuments(query: string | SqlQuerySpec, options?: FeedOptions): Promise<{resources: TEntity[], continuationToken: string, headers: any}> {
        return new Promise(async (resolve, reject) => {
            try {
                this.validateOptions(options)

                let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options)
                
                let { resources, headers } = await this.executeNext(iterator)
                
                resolve({
                    resources,
                    continuationToken: resources !== undefined ? headers['x-ms-continuation'] : null,
                    headers
                })
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Iterate through documents asynchronious with `for await()`
     * @param query 
     * @param options 
     */
    public async * iterateDocuments(query: string | SqlQuerySpec, options?: FeedOptions): AsyncIterableIterator<TEntity> {
        this.validateOptions(options)

        let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options)

        do
        {
            let { resources, headers } = await this.executeNext(iterator)

            if(resources === undefined)
                break;

            yield *resources

        } while(true)
    }

    /**
     * Creates a new document that doesn't exists.
     * @param document 
     * @param options 
     */
    public createDocument(document: TEntity, options: DocumentOptions = undefined): Promise<{resource: TEntity, headers: any }> {
        return new Promise((resolve, reject) => {
            try {
                let opts: DocumentOptions = Object.assign({  
                }, options)

                this.validateOptions(options)

                this.client.createDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if(error) 
                        return reject(this.transformError(error))

                    try {
                        resolve({ resource: this.makeEntity(resource), headers })
                    } 
                    catch(ex) {
                        reject(ex)
                    }
                })
            }
            catch(ex) {
                reject(ex);
            }
        })
    }

    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up. 
     * @param document 
     * @param options 
     */
    public updateDocument(document: Partial<TEntity>, options: RequestOptions = undefined): Promise<{resource: TEntity, headers: any}> {
        return new Promise(async (resolve, reject) => {
            try {
                if(document.id == null)
                    throw new Error(`Document is missing property id`)

                this.validateOptions(options)

                for(let retry = 0; retry < 4; retry++) {
                    let { resource, etag } = await this.readDocument(document.id, options)

                    if(resource == null)
                        throw new Error(`Document "${this.createDocumentLink(<TEntity>document)}" does not exist.`)

                    let newDocument = this.apply(resource, document);

                    try {
                        let { resource: newResource, headers } = await this.replaceDocument(newDocument, Object.assign(options || {}, {
                            accessCondition : { type: 'IfMatch', condition: etag }
                        }))

                        resolve({ resource: newResource, headers })
                    }
                    catch(ex) {
                        if(ex.statusCode != 412 || retry == 4) 
                            throw ex;

                        // try again but wait a bit
                        await this.delay(100 + (200 * (retry - 1)));
                    }
                }
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Replaces a document that exists.
     * @param document 
     * @param options 
     */
    public replaceDocument(document: TEntity, options: RequestOptions = undefined): Promise<{resource: TEntity, headers: any}> {
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options)

                this.client.replaceDocument(this.createDocumentLink(document), document, options, (error, resource, headers) => {
                    if(error)
                        return reject(this.transformError(error))

                    try {
                        resolve({
                            resource: this.makeEntity(resource),
                            headers
                        })
                    }
                    catch(ex) {
                        reject(ex)
                    }
                })
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Creates a new document or replacing it if it exists
     * @param document 
     * @param options 
     */
    public upsertDocument(document: TEntity, options: DocumentOptions = undefined): Promise<{ resource: TEntity, headers: any}> {
        return new Promise((resolve, reject) => {
            try {
                this.validateOptions(options)

                this.client.upsertDocument(this.createCollectionLink(), document, options, (error, resource, headers) => {
                    if(error)
                        return reject(this.transformError(error))

                    try {
                        resolve({
                            resource: this.makeEntity(resource),
                            headers
                        })
                    } 
                    catch(ex) {
                        reject(ex)   
                    }
                })
            }
            catch(err) {
                reject(err)
            }
        })
    }

    /**
     * Deletes a document by its document id
     * @param document 
     */
    public deleteDocument(document: TEntity, options?: RequestOptions): Promise<{resource: void, headers: any}>
    /**
     * Deletes a document by its id
     * @param id 
     */
    public deleteDocument(id: string, options?: RequestOptions): Promise<{resource: void, headers: any}>
    public deleteDocument(idordoc: any, options: RequestOptions = undefined): Promise<{resource: void, headers: any}> {
        return new Promise((resolve, reject) => {
            try {
                this.client.deleteDocument(this.createDocumentLink(idordoc), options, (error, resource, headers) => {
                    if(error) 
                        return reject(this.transformError(error))

                    resolve({
                        resource: null,
                        headers
                    })
                })
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Get the current throughput (RU/s)
     */
    public async getThroughput(): Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                let offer = await this.getOffer()

                if(!offer.content)
                    throw new Error(`Offer for collection "${this.createCollectionLink()}" is missing content`);
                
                resolve(offer.content.offerThroughput)
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Set the throughput (RU/s) to any number between 400 and 10000
     * @param value RU/s
     */
    public async setThroughput(value: number): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                if(value < 400) value = 400
                if(value > 10000) value = 10000

                if(await this.reserveOffer() == true) {
                    let offer = await this.getOffer()

                    if(!offer.content)
                        throw new Error(`Offer for collection "${this.createCollectionLink()}" is missing content`);
                    
                    offer.content.offerThroughput = value;               

                    this.client.replaceOffer(offer._self, offer, (error, resource) => {
                        if(error)
                            return reject(this.transformError(error))

                        resolve(true)

                        this.offerReserved = false
                    })
                }
                else {
                    resolve(false)

                    this.offerReserved = false
                }
            }
            catch(ex) {
                reject(ex)

                this.offerReserved = false
            }
        })
    }

    /**
     * Increase the throughput (RU/s), defaults to 200. Will never exceed 10000
     * @param value RU/s
     */    
    public async increaseThroughput(value: number = 200): Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                if(value < 0) value = 200

                if(await this.reserveOffer() == true) {
                    let offer = await this.getOffer()

                    if(!offer.content)
                        throw new Error(`Offer for collection "${this.createCollectionLink()}" is missing content`);

                    offer.content.offerThroughput = Math.min( (offer.content.offerThroughput + value), 10000)

                    this.client.replaceOffer(offer._self, offer, (error, resource) => {
                        if(error)
                            return reject(this.transformError(error))

                        resolve(offer.content.offerThroughput)

                        this.offerReserved = false
                    })
                }
                else {
                    resolve(undefined)

                    this.offerReserved = false
                }
            }
            catch(ex) {
                reject(ex)

                this.offerReserved = false
            }
        })
    }

    /**
     * Decrease the throughput (RU/s), defaults to 200. Will never go below 400
     * @param value RU/s
     */
    public async decreaseThroughput(value: number = 200): Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                if(value < 0) value = 200
                
                if(await this.reserveOffer() == true) {
                    let offer = await this.getOffer()

                    if(!offer.content)
                        throw new Error(`Offer for collection "${this.createCollectionLink()}" is missing content`);

                    offer.content.offerThroughput = Math.max(offer.content.offerThroughput - value, 400);

                    this.client.replaceOffer(offer._self, offer, (error, resource) => {
                        if(error)
                            return reject(this.transformError(error))

                        resolve(offer.content.offerThroughput)

                        this.offerReserved = false
                    })
                }
                else {
                    resolve(undefined)

                    this.offerReserved = false
                }
            }
            catch(ex) {
                reject(ex)

                this.offerReserved = false
            }
        })
    }

    private reserveOffer(timeout: number = 15000): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let time = timeout,
                interval = 50,

                thread = setInterval(() => {
                    if(this.offerReserved == false) {
                        clearTimeout(thread)
                        resolve(true)
                    }
                    else if ((time -= interval) < 0) {
                        clearTimeout(thread);
                        resolve(false);
                    }

                }, interval);
        })
    }

    private getOffer(): Promise<any> {  
        let getCollectionSelfLink = async () => {
            return new Promise((resolve, reject) => {
                try {
                    this.client.readCollection(this.createCollectionLink(), async (err, resource) => {
                        resolve(resource._self)
                    });
                }
                catch(ex) {
                    reject(ex)
                }
            })
        }     

        return new Promise(async (resolve, reject) => {
            try {
                if(!this.offerSelfLink) {
                    let iterator = this.client.queryOffers({ 
                        query: 'SELECT * FROM r WHERE r.resource = @selfLink',
                        parameters: [
                            { name: '@selfLink', value: await getCollectionSelfLink() }
                        ]
                    });

                    iterator.executeNext((error, resources, headers) => {
                        if(error)
                            return reject(this.transformError(error))

                        if(resources.length != 1)
                            return reject(new Error(`Offer for collection "${this.createCollectionLink()}" is not found`))

                        this.offerSelfLink = resources[0]._self
                        
                        resolve(resources[0])
                    })
                }
                else {
                    this.client.readOffer(this.offerSelfLink, (error, resource) => {
                        if(error)
                            return reject(this.transformError(error))

                        resolve(resource)
                    })
                }
            } catch(ex) {
                reject(ex)
            }
        })
        
    }    

    protected get client() {
        if(this._client == null)
            this._client = new DocumentClient(this.host, {
                masterKey: this.key
            }, this.policy)
        
        return this._client
    }

    protected createDatabaseLink() {
        return UriFactory.createDatabaseUri(this.databaseId)
    }

    protected createCollectionLink() {
        return UriFactory.createDocumentCollectionUri(this.databaseId, this.collectionId)
    }

    protected createDocumentLink(id: string): string
    protected createDocumentLink(document: TEntity): string
    protected createDocumentLink(document: any): string {
        return UriFactory.createDocumentUri(this.databaseId, this.collectionId, typeof document == 'object' ? document.id : document)
    }

    private executeNext(iterator: QueryIterator<RetrievedDocument>): Promise<{resources: TEntity[], headers: any}> {
        return new Promise((resolve, reject) => {
            try {
                iterator.executeNext((error, resources, headers) => {
                    if(error)
                        return reject(this.transformError(error))

                    if(error === undefined && resources === undefined)
                        return resolve({ resources: undefined, headers: undefined })

                    resolve({
                        resources: resources.map(r => this.makeEntity(r)),
                        headers
                    })
                })
                
            } 
            catch(ex) {
                reject(ex)
            }
        })
    }    

    private makeEntity<T extends NewDocument>(doc: T): TEntity {
        return <TEntity>this.makeDocument(doc)
    }

    private makeDocument(resource: TEntity): NewDocument
    private makeDocument(resource: NewDocument): NewDocument
    private makeDocument(resource: RetrievedDocument): NewDocument
    private makeDocument<T extends NewDocument>(resource: T): NewDocument {
        if(typeof resource != 'object' || resource == null)
            return null

        if(this._washDocuments == false)
            return resource;
        
        let document: NewDocument = { id: resource.id }

        for(let propertyName of Object.getOwnPropertyNames(resource)) {
            switch(propertyName) {
                case '_rid':
                case '_self':
                case '_etag':
                case '_attachments':
                case '_ts':
                    break

                default:
                    document[propertyName] = resource[propertyName]
                    break
            }
        }

        return document
    }

    private delay(ms: number = 1000) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, Number(ms) || 1000)
        })
    }

    private transformError(err) {
        try {
            if(err.message == null) {
                let json = typeof err.body == 'string' ? JSON.parse(err.body) : err

                if(json && json.message)
                    [ err.message ] = json.message.split(/\r\n/)
            }
        }
        catch(ex) {
        }

        return err
    }

    private validateOptions(options: FeedOptions | RequestOptions | DocumentOptions): void {
        for(let [key, value] of Object.entries(this.getHeaders(options))) 
        {
            if(value === undefined)
                throw new TypeError(`Invalid value "${value}" for header "${key}"`)
        }
    }

    private getHeaders(options: FeedOptions): { [index: string]: string } 
    private getHeaders(options: RequestOptions): { [index: string]: string }
    private getHeaders(options: DocumentOptions): { [index: string]: string }
    private getHeaders(options: any): { [index: string]: string } {
        var headers = {}
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
            } else {
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

    private apply<TEntity>(target: TEntity, source: Partial<TEntity>): TEntity {
        let targetProto: Object = this.isClass(target) == true ? Object.getPrototypeOf(target) : target,
            sourceProto: Object = this.isClass(source) == true ? Object.getPrototypeOf(source) : source,
            destination = Object.assign({}, target)

        for (let property of Object.getOwnPropertyNames(sourceProto)) {
            if (source[property] === undefined)
                continue
            
            if (targetProto.hasOwnProperty(property)) {
                if(target[property] !== undefined && target[property] !== null) {
                    switch(target[property].constructor) {
                        case Function:
                            break
                
                        case Array:
                        case Date:
                        case Boolean:
                        case Number:
                        case String:
                            destination[property] = source[property]
                            break
            
                        case Object:
                        default:
                            destination[property] = this.apply(destination[property], source[property])
                            break
                    }

                    continue
                }
            }

            destination[property] = source[property];
        }

        return destination;
    }

    private isClass(obj: any) {
        const isCtorClass = obj.constructor && obj.constructor.toString().substring(0, 5) === 'class';

        if (obj.prototype === undefined)
            return isCtorClass
        
        const isPrototypeCtorClass = obj.prototype.constructor
            && obj.prototype.constructor.toString
            && obj.prototype.constructor.toString().substring(0, 5) === 'class'

        return isCtorClass || isPrototypeCtorClass
    }    
}