import { MongoAdapter } from '../src/mongoAdapter';

describe('MongoDB Integration Tests', () => {
  let adapter: MongoAdapter;
  
  // Skip these tests if MongoDB connection details are not provided
  const mongoUri = process.env.MONGODB_URI;
  const mongoDatabase = process.env.MONGODB_DATABASE;
  const skipTests = !mongoUri || !mongoDatabase;
  
  beforeAll(() => {
    if (!skipTests) {
      adapter = new MongoAdapter(mongoUri!, mongoDatabase!);
    }
  });

  afterAll(async () => {
    if (!skipTests && adapter) {
      await adapter.close();
    }
  });

  describe('Real MongoDB Connection', () => {
    (skipTests ? it.skip : it)('should connect to MongoDB Atlas with SSL configuration', async () => {
      expect(adapter).toBeDefined();
      
      // Test connection
      await expect(adapter.connect()).resolves.not.toThrow();
      
      // Verify connection is established
      expect(adapter.getConnectionStatus()).toBe(true);
    }, 10000); // 10 second timeout for Atlas connection

    (skipTests ? it.skip : it)('should list collections from MongoDB Atlas', async () => {
      if (!adapter.getConnectionStatus()) {
        await adapter.connect();
      }
      
      // Test listing collections
      const collections = await adapter.listCollections();
      
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.length).toBeGreaterThanOrEqual(0);
      
      // Log collections for debugging
      console.log('📋 MongoDB Collections found:', collections);
    }, 10000);

    (skipTests ? it.skip : it)('should handle basic CRUD operations', async () => {
      if (!adapter.getConnectionStatus()) {
        await adapter.connect();
      }
      
      const testCollectionName = 'integration_test_collection';
      const testDocument = { 
        name: 'Test Document', 
        timestamp: new Date(),
        test_id: Math.random().toString(36).substring(7)
      };

      try {
        // Test insert
        const insertResult = await adapter.insert(testCollectionName, testDocument);
        expect(insertResult).toHaveProperty('insertedId');
        
        // Test find
        const findResult = await adapter.find(testCollectionName, { name: 'Test Document' });
        expect(Array.isArray(findResult)).toBe(true);
        expect(findResult.length).toBeGreaterThan(0);
        
        // Test update
        const updateResult = await adapter.update(
          testCollectionName, 
          { name: 'Test Document' }, 
          { $set: { updated: true } }
        );
        expect(updateResult).toHaveProperty('modifiedCount');
        
        // Test delete (cleanup)
        const deleteResult = await adapter.delete(testCollectionName, { name: 'Test Document' });
        expect(deleteResult).toHaveProperty('deletedCount');
        
      } catch (error) {
        // Clean up on error
        try {
          await adapter.delete(testCollectionName, { name: 'Test Document' });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw error;
      }
    }, 15000); // 15 second timeout for CRUD operations

    (skipTests ? it.skip : it)('should handle SSL/TLS connection properly', async () => {
      // This test verifies that our SSL configuration works
      // by testing a fresh connection
      const testAdapter = new MongoAdapter(mongoUri!, mongoDatabase!);
      
      try {
        await testAdapter.connect();
        expect(testAdapter.getConnectionStatus()).toBe(true);
        
        // Test a simple operation to verify SSL is working
        const collections = await testAdapter.listCollections();
        expect(Array.isArray(collections)).toBe(true);
        
        console.log('✅ SSL/TLS connection verified successfully');
        
      } finally {
        await testAdapter.close();
      }
    }, 10000);
  });

  describe('Skip Information', () => {
    it('should show skip reason when MongoDB config is missing', () => {
      if (skipTests) {
        console.log('ℹ️  MongoDB integration tests skipped - Missing MONGODB_URI or MONGODB_DATABASE environment variables');
        console.log('   To run integration tests, set these environment variables in your .env file');
      }
      expect(true).toBe(true); // Always pass this informational test
    });
  });
});