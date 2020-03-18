if(!Symbol.asyncIterator)
    (Symbol as any).asyncIterator = Symbol.asyncIterator || "__@@asyncIterator__";

import { CosmosClient, ItemDefinition, ConnectionPolicy, SqlQuerySpec, FeedOptions, RequestOptions } from '@azure/cosmos'

export default class DocumentDBClient<TEntity extends ItemDefinition> {
    private _client: CosmosClient;
    private _policy: ConnectionPolicy;

    private offerSelfLink: string
    private offerReserved: boolean = false

    private _washDocuments: boolean = true

    constructor(private host: string, private key: string, private databaseId: string, private collectionId: string) {
            
    }

    public get policy(): ConnectionPolicy {
        if(this._policy == null) {
            this._policy = {}
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
    public async readDocument(id: string, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: TEntity, etag: string, headers: any}>
    /**
     * Reads a document by its document id
     * @param document
     * @param options 
     */
    public async readDocument(document: TEntity, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: TEntity, etag: string, headers: any}>
    public async readDocument(idordoc: any, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: TEntity, etag: string, headers: any}> {        
        try {
            let item = this.client.database(this.databaseId).container(this.collectionId).item(typeof idordoc == 'object' ? idordoc.id : idordoc, options && options.partitionKey || undefined)

            if(item) {
                let { resource, headers, etag } = await item.read(options)

                return { 
                    resource: this.makeEntity(resource), 
                    etag: this.fixEtag(etag), 
                    headers
                }
            }

            return { resource: null, etag: null, headers: { } }
        }
        catch(ex) {
            throw ex
        }
    }

    /**
     * Query for the documents with paging using ContinuationToken
     * @param query 
     * @param options 
     */
    public async queryDocuments(query: string | SqlQuerySpec, options?: FeedOptions): Promise<{resources: TEntity[], continuationToken: string, headers: any}> {
        let iterator = this.client.database(this.databaseId).container(this.collectionId).items.query(query, options)
        
        let { resources, continuationToken, ...rest } = await iterator.fetchNext()
        
        return {
            resources: resources.map(resource => this.makeEntity(resource)),
            continuationToken,
            headers: rest['headers']
        }
    }

    /**
     * Iterate through documents asynchronious with `for await()`
     * @param query 
     * @param options 
     */
    public async * iterateDocuments(query: string | SqlQuerySpec, options?: FeedOptions): AsyncIterableIterator<TEntity> {
        let iterator = this.client.database(this.databaseId).container(this.collectionId).items.query(query, options)

        do
        {
            let { resources } = await iterator.fetchNext()

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
    public async createDocument(document: TEntity, options?: RequestOptions): Promise<{resource: TEntity, etag: string, headers: any }> {
        let { resource, etag, headers } = await this.client.database(this.databaseId).container(this.collectionId).items.create(document, options)

        return { 
            resource, 
            etag: this.fixEtag(etag), 
            headers 
        }
    }

    /**
     * Updates a document that exists by patching the changes, will retry 3 times before giving up. 
     * @param document 
     * @param options 
     */
    public async updateDocument(document: Partial<TEntity>, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: TEntity, etag: string, headers: any}> {       
        if(document.id == null)
            throw new Error(`Document is missing property id`)

        for(let retry = 0; retry < 4; retry++) {
            let item = this.client.database(this.databaseId).container(this.collectionId).item(document.id, options && options.partitionKey || undefined)

            let { resource, etag, statusCode } = await item.read(options)

            if(statusCode == 404)
                throw new Error(`Document ${document.id} does not exist.`)

            let newDocument = this.apply(resource, document);

            try {
                let { resource: newResource, etag: newEtag, headers, statusCode } = await item.replace(newDocument, Object.assign(options || {}, {
                    accessCondition : { type: 'IfMatch', condition: etag }
                }))

                if(statusCode == 200)
                    return { 
                        resource: this.makeEntity(newResource), 
                        etag: this.fixEtag(newEtag), 
                        headers 
                    }

                throw { statusCode }
            }
            catch(ex) {
                if(ex.code != 412 || retry == 4) 
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
    public async replaceDocument(document: TEntity, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: TEntity, etag: string, headers: any}> {
        let item = this.client.database(this.databaseId).container(this.collectionId).item(document.id, options && options.partitionKey || undefined)

        let { resource, etag } = await item.read(options)

        if(resource == null)
            throw new Error(`Document ${document.id} does not exist.`)

        let newDocument = this.apply(resource, document);

        let { resource: newResource, etag: newEtag, headers } = await item.replace(newDocument, options)

        return {
            resource: this.makeEntity(newResource), 
            etag: this.fixEtag(newEtag),
            headers 
        }
    }

    /**
     * Creates a new document or replacing it if it exists
     * @param document 
     * @param options 
     */
    public async upsertDocument(document: TEntity, options?: RequestOptions): Promise<{ resource: TEntity, etag: string, headers: any}> {
        let { resource, headers, etag } = await this.client.database(this.databaseId).container(this.collectionId).items.upsert(document, options)

        return { 
            resource: this.makeEntity(resource), 
            etag: this.fixEtag(etag), 
            headers 
        }
    }

    /**
     * Deletes a document by its document id
     * @param document 
     */
    public deleteDocument(document: TEntity, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: void, headers: any}>
    /**
     * Deletes a document by its id
     * @param id 
     */
    public deleteDocument(id: string, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: void, headers: any}>
    public async deleteDocument(idordoc: any, options?: RequestOptions & { partitionKey?: string }): Promise<{resource: void, headers: any}> {
        let item = this.client.database(this.databaseId).container(this.collectionId).item(typeof idordoc == 'object' ? idordoc.id : idordoc, options && options.partitionKey || undefined)
        let { resource, headers, statusCode } = await item.delete(options)
        
        if(statusCode == 404)
            return { resource: null, headers }

        return { resource, headers }
    }

    /**
     * Get the current throughput (RU/s)
     */
    public async getThroughput(): Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                let offer = await this.getOffer()

                if(!offer.content)
                    throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                
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
                
                if(await this.reserveOffer() == true) {
                    let offer = await this.getOffer()

                    if(!offer.content)
                        throw new Error(`Offer for collection "${this.collectionId}" is missing content`);
                    
                    offer.content.offerThroughput = value;               

                    let { statusCode } = await this.client.offer(offer.id).replace(offer)

                    this.offerReserved = false

                    return statusCode == 200
                }
                else {
                    this.offerReserved = false

                    return false
                }
            }
            catch(ex) {
                this.offerReserved = false

                throw ex
            }
        })
    }

    /**
     * Increase the throughput (RU/s), defaults to 200
     * @param value RU/s
     */    
    public async increaseThroughput(value: number = 200, max: number = 10000): Promise<number> {
        try {
            if(value < 0) value = 200

            if(await this.reserveOffer() == true) {
                let offer = await this.getOffer()

                if(!offer.content)
                    throw new Error(`Offer for collection "${this.collectionId}" is missing content`);

                offer.content.offerThroughput = Math.min( (offer.content.offerThroughput + value), Number(max) || 10000)

                let { statusCode } = await this.client.offer(offer.id).replace(offer)

                this.offerReserved = false

                return statusCode == 200 ? offer.content.offerThroughput : undefined
            }
            else {
                this.offerReserved = false

                return undefined
            }
        }
        catch(ex) {
            this.offerReserved = false

            throw ex
        }
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
                        throw new Error(`Offer for collection "${this.collectionId}" is missing content`);

                    offer.content.offerThroughput = Math.max(offer.content.offerThroughput - value, 400);

                    let { statusCode } = await this.client.offer(offer.id).replace(offer)
                    
                    this.offerReserved = false

                    return statusCode == 200 ? offer.content.offerThroughput : undefined
                }
                else {
                    this.offerReserved = false

                    return undefined
                }
            }
            catch(ex) {
                this.offerReserved = false

                throw ex
            }
        })
    }

    private fixEtag(value: string): string {
        let match = /^\"?([^"]*)\"?$/.exec(value || '')
        if(match)
            return match[1]

        return value
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

    private async getOffer(): Promise<Record<string, any>> {  
        if(!this.offerSelfLink) {
            let { resource, statusCode } = await this.client.database(this.databaseId).container(this.collectionId).read()

            this.offerSelfLink = resource._self
        }

        let offers = await this._client.offers.readAll().fetchAll()
        if(offers) {
            let offer = offers.resources.find(resource => resource.resource == this.offerSelfLink)

            if(!offer)
                throw new Error(`Offer for collection "${this.collectionId}" is not found`)

            return offer
        }

        return null   
    }

    protected get client() {
        if(this._client == null) {
            this._client = new CosmosClient({ endpoint: this.host, key: this.key, connectionPolicy: this._policy }) // new CosmosClient(`AccountEndpoint=${this.host};AccountKey=${this.key};`,)
        }
        
        return this._client
    }

    private makeEntity<T extends ItemDefinition>(doc: T): TEntity {
        return <TEntity>this.makeDocument(doc)
    }

    private makeDocument(resource: TEntity): ItemDefinition
    private makeDocument(resource: ItemDefinition): ItemDefinition
    private makeDocument<T extends ItemDefinition>(resource: T): ItemDefinition {
        if(typeof resource != 'object' || resource == null)
            return null

        if(this._washDocuments == false)
            return resource;
        
        let document: ItemDefinition = { id: resource.id }

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

export { ItemDefinition as Document }