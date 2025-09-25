import { MongoClient, Db } from "mongodb";

export class MongoAdapter {
  private client: MongoClient;
  private db: Db;
  private isConnected: boolean = false;
  
  constructor(uri: string, dbName: string) {
    // Security: Basic validation of connection URI and database name
    if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
      throw new Error("MongoDB URI cannot be empty");
    }
    if (!dbName || typeof dbName !== 'string' || dbName.trim().length === 0) {
      throw new Error("MongoDB database name cannot be empty");
    }
    
    // Security: Validate database name format
    if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) {
      throw new Error("Invalid database name: only alphanumeric characters, underscores, and hyphens allowed");
    }
    
    this.client = new MongoClient(uri, {
      // Security: Add connection options for better security
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
      
      // SSL/TLS Configuration for MongoDB Atlas
      tls: true,
      tlsAllowInvalidCertificates: true,  // Allow invalid certificates for development
      tlsAllowInvalidHostnames: true,     // Allow invalid hostnames for development
      
      // Additional Atlas-specific options
      retryWrites: true,
      w: 'majority',
      
      // Connection retry options
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 30000,
      
      // Authentication options (usually handled by connection string)
      authSource: 'admin'
    });
    this.db = this.client.db(dbName);
  }

  /**
   * Check if the adapter is connected to MongoDB
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        
        // Test the connection by pinging the database
        await this.client.db("admin").command({ ping: 1 });
        
        this.isConnected = true;
      } catch (error) {
        this.isConnected = false;
        
        // Provide more specific error messages
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          if (error.message.includes('SSL')) {
            errorMessage = `SSL/TLS connection error: ${error.message}. Try updating your connection string or checking certificate settings.`;
          } else if (error.message.includes('authentication')) {
            errorMessage = `Authentication failed: ${error.message}. Check your username and password.`;
          } else if (error.message.includes('timeout')) {
            errorMessage = `Connection timeout: ${error.message}. Check your network or MongoDB Atlas whitelist.`;
          } else {
            errorMessage = error.message;
          }
        }
        
        throw new Error(`Failed to connect to MongoDB: ${errorMessage}`);
      }
    }
  }
  
  async find(collection: string, filter: any = {}, projection: any = {}) {
    // Security: Collection name is already validated by input validator
    await this.connect();
    try {
      return await this.db
        .collection(collection)
        .find(filter)
        .project(projection)
        .limit(25) // Security: Hard limit to prevent resource exhaustion
        .toArray();
    } catch (error) {
      throw new Error(`MongoDB find operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async insert(collection: string, document: any) {
    await this.connect();
    try {
      return await this.db.collection(collection).insertOne(document);
    } catch (error) {
      throw new Error(`MongoDB insert operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async update(collection: string, filter: any, update: any) {
    await this.connect();
    try {
      return await this.db.collection(collection).updateMany(filter, update);
    } catch (error) {
      throw new Error(`MongoDB update operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async delete(collection: string, filter: any) {
    await this.connect();
    try {
      return await this.db.collection(collection).deleteMany(filter);
    } catch (error) {
      throw new Error(`MongoDB delete operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async listCollections() {
    await this.connect();
    try {
      return (await this.db.listCollections().toArray()).map((c) => c.name);
    } catch (error) {
      throw new Error(`MongoDB listCollections operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async close() {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}
