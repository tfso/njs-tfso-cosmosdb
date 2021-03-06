# tfso-cosmosdb
Promise wrapper for CosmosDB with simplified usage that only works on documents

```typescript
import DocumentClient from 'tfso-cosmosdb'

let client = new DocumentClient<ILog>('https://localhost:8081', '....', 'mydb', 'mycollection')

let { resource: mydoc } = await client.readDocument('<id>', { partitionKey: '<client>' })

```

In javascript you may have to do a require, maybe like; `const { _default: DocumentClient } = require('tfso-cosmosdb')`

## methods

```typescript
washDocuments: boolean // defaults to true

readDocument(id: string, options: RequestOptions): Promise<{ resource: TEntity; etag: string; headers: any; }>
readDocument(document: TEntity, options: RequestOptions): Promise<{ resource: TEntity; etag: string; headers: any; }>

queryDocuments(query: string | SqlQuerySpec, options: FeedOptions): Promise<{ resources: TEntity[]; continuationToken: string; headers: any; }>
iterateDocuments(query: string | SqlQuerySpec, options?: FeedOptions): AsyncIterableIterator<TEntity>

createDocument(document: TEntity, options?: DocumentOptions): Promise<{ resource: TEntity; headers: any; }>

updateDocument(document: Partial<TEntity>, options: RequestOptions): Promise<{ resource: TEntity; headers: any; }>
replaceDocument(document: TEntity, options: RequestOptions): Promise<{ resource: TEntity; headers: any; }>
upsertDocument(document: TEntity, options: DocumentOptions): Promise<{ resource: TEntity; headers: any; }>

deleteDocument(document: TEntity): Promise<{ resource: void; headers: any; }>

getThroughput(value: number): Promise<number>
setThroughput(value: number): Promise<boolean>
increaseThroughput(value: number = 200): Promise<number>
decreaseThroughput(value: number = 200): Promise<number>
```
