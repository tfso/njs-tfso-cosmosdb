import { UriFactory, DocumentClient, ConnectionPolicy, NewDocument, RequestOptions, DocumentOptions, RetrievedDocument, FeedOptions, SqlQuerySpec, QueryIterator } from 'documentdb'
import { DocumentBase } from 'documentdb/lib'

export default class DocumentDBClient<TEntity extends NewDocument> {
    private _client: DocumentClient;
    private _policy: ConnectionPolicy;

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
     * Query for the documents with paging using ContinuationToke
     * @param query 
     * @param options 
     */
    public queryDocuments(query: string | SqlQuerySpec, options: FeedOptions): Promise<{resources: TEntity[], continuationToken: string, headers: any}> {
        return new Promise(async (resolve, reject) => {
            try {
                let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options)
                let { resources, headers } = await this.executeNext(iterator)
                
                resolve({
                    resources,
                    continuationToken: iterator.hasMoreResults ? headers['x-ms-continuation'] : null,
                    headers
                })
            }
            catch(ex) {
                reject(ex)
            }
        })
    }

    /**
     * Query for the documents from the beginning or the point of continuationToken until the end
     * @param query 
     * @param options 
     */
    public async queryAllDocuments(query: string | SqlQuerySpec, options: FeedOptions): Promise<{resources: TEntity[], headers: any}> {
        let iterator = this.client.queryDocuments(this.createCollectionLink(), query, options),
            resources = new Array<TEntity>();
        
        while(iterator.hasMoreResults) { // hasMoreResults is deprecated
            let { resources: items } = await this.executeNext(iterator)

            resources.push(...items)
        }

        return {
            resources: resources, 
            headers: null
        }
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

                for(let retry = 0; retry < 4; retry++) {
                    let { resource, etag } = await this.readDocument(document.id, options)

                    if(resource == null)
                        throw new Error(`Document "${this.createDocumentLink(<TEntity>document)}" does not exist.`)

                    let newDocument = Object.assign(<NewDocument>{}, resource, document);

                    try {
                        let { resource: newResource, headers } = await this.replaceDocument(newDocument, Object.assign(options || {}, {
                            accessCondition : { type: 'IfMatch', condition: etag }
                        }))

                        return { resource: newResource, headers }
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

    private get client() {
        if(this._client == null)
            this._client = new DocumentClient(this.host, {
                masterKey: this.key
            }, this.policy)
        
        return this._client
    }

    private createDatabaseLink() {
        return UriFactory.createDatabaseUri(this.databaseId)
    }

    private createCollectionLink() {
        return UriFactory.createDocumentCollectionUri(this.databaseId, this.collectionId)
    }

    private createDocumentLink(id: string): string
    private createDocumentLink(document: TEntity): string
    private createDocumentLink(document: any): string {
        return UriFactory.createDocumentUri(this.databaseId, this.collectionId, typeof document == 'object' ? document.id : document)
    }

    private executeNext(iterator: QueryIterator<RetrievedDocument>): Promise<{resources: TEntity[], headers: any}> {
        return new Promise((resolve, reject) => {
            try {
                if(iterator.hasMoreResults) {
                    iterator.executeNext((error, resources, headers) => {
                        if(error)
                            return reject(this.transformError(error))

                        resolve({
                            resources: resources.map(r => this.makeEntity(r)),
                            headers
                        })
                    })
                }
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
        let document: NewDocument = { id: resource.id }

        if(typeof resource != 'object' || resource == null)
            return null

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
}