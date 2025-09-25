import { MongoClient, Db } from "mongodb";

export class MongoAdapter {
  private client: MongoClient;
  private db: Db;
  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }
  async connect() {
    await this.client.connect();
  }
  async find(collection: string, filter: any = {}, projection: any = {}) {
    await this.connect();
    return this.db
      .collection(collection)
      .find(filter)
      .project(projection)
      .limit(25)
      .toArray();
  }
  async insert(collection: string, document: any) {
    await this.connect();
    return this.db.collection(collection).insertOne(document);
  }
  async update(collection: string, filter: any, update: any) {
    await this.connect();
    return this.db.collection(collection).updateMany(filter, update);
  }
  async delete(collection: string, filter: any) {
    await this.connect();
    return this.db.collection(collection).deleteMany(filter);
  }
  async listCollections() {
    await this.connect();
    return (await this.db.listCollections().toArray()).map((c) => c.name);
  }
  async close() {
    await this.client.close();
  }
}
