import { MongoAdapter } from '../src/mongoAdapter';

// Mock the mongodb module
jest.mock('mongodb', () => ({
  MongoClient: jest.fn(),
}));

describe('MongoAdapter', () => {
  let adapter: MongoAdapter;
  let mockClient: any;
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock chain: client -> db -> collection
    mockCollection = {
      find: jest.fn().mockReturnThis(),
      project: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn(),
      insertOne: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn()
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
      listCollections: jest.fn().mockReturnValue({
        toArray: jest.fn()
      }),
      command: jest.fn().mockResolvedValue({ ok: 1 }) // Mock for ping command
    };

    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      db: jest.fn((dbName) => {
        if (dbName === "admin") {
          // Return admin db mock with command method
          return {
            command: jest.fn().mockResolvedValue({ ok: 1 })
          };
        }
        // Return main database mock
        return mockDb;
      })
    };

    const { MongoClient } = require('mongodb');
    MongoClient.mockImplementation(() => mockClient);
  });

  describe('Constructor', () => {
    it('should create MongoAdapter with valid URI and database name', () => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
      
      expect(adapter).toBeInstanceOf(MongoAdapter);
      expect(require('mongodb').MongoClient).toHaveBeenCalledWith('mongodb://localhost:27017', {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        // SSL/TLS Configuration for MongoDB Atlas
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true,
        // Additional Atlas-specific options
        retryWrites: true,
        w: 'majority',
        // Connection retry options
        maxIdleTimeMS: 30000,
        connectTimeoutMS: 30000,
        // Authentication options
        authSource: 'admin'
      });
    });

    it('should throw error with empty URI', () => {
      expect(() => new MongoAdapter('', 'testdb')).toThrow('MongoDB URI cannot be empty');
    });

    it('should throw error with null URI', () => {
      expect(() => new MongoAdapter(null as any, 'testdb')).toThrow('MongoDB URI cannot be empty');
    });

    it('should throw error with undefined URI', () => {
      expect(() => new MongoAdapter(undefined as any, 'testdb')).toThrow('MongoDB URI cannot be empty');
    });

    it('should throw error with whitespace-only URI', () => {
      expect(() => new MongoAdapter('   \n\t  ', 'testdb')).toThrow('MongoDB URI cannot be empty');
    });

    it('should throw error with empty database name', () => {
      expect(() => new MongoAdapter('mongodb://localhost:27017', '')).toThrow('MongoDB database name cannot be empty');
    });

    it('should throw error with null database name', () => {
      expect(() => new MongoAdapter('mongodb://localhost:27017', null as any)).toThrow('MongoDB database name cannot be empty');
    });

    it('should throw error with undefined database name', () => {
      expect(() => new MongoAdapter('mongodb://localhost:27017', undefined as any)).toThrow('MongoDB database name cannot be empty');
    });

    it('should throw error with invalid database name characters', () => {
      expect(() => new MongoAdapter('mongodb://localhost:27017', 'invalid/db')).toThrow(
        'Invalid database name: only alphanumeric characters, underscores, and hyphens allowed'
      );
    });

    it('should accept valid database names', () => {
      const validNames = ['testdb', 'test_db', 'test-db', 'testDB123', 'test123'];
      
      validNames.forEach(dbName => {
        expect(() => new MongoAdapter('mongodb://localhost:27017', dbName)).not.toThrow();
      });
    });

    it('should apply security connection options', () => {
      new MongoAdapter('mongodb://localhost:27017', 'testdb');
      
      const { MongoClient } = require('mongodb');
      const lastCall = MongoClient.mock.calls[MongoClient.mock.calls.length - 1];
      const options = lastCall[1];
      
      expect(options.maxPoolSize).toBe(10);
      expect(options.serverSelectionTimeoutMS).toBe(5000);
      expect(options.socketTimeoutMS).toBe(45000);
      expect(options.family).toBe(4);
    });
  });

  describe('connect method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should connect successfully on first call', async () => {
      await adapter.connect();
      
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect if already connected', async () => {
      await adapter.connect();
      await adapter.connect();
      await adapter.connect();
      
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors gracefully', async () => {
      const connectionError = new Error('Connection failed');
      mockClient.connect.mockRejectedValue(connectionError);

      await expect(adapter.connect()).rejects.toThrow('Failed to connect to MongoDB: Connection failed');
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should handle unknown connection errors', async () => {
      mockClient.connect.mockRejectedValue('Unknown error');

      await expect(adapter.connect()).rejects.toThrow('Failed to connect to MongoDB: Unknown error');
    });
  });

  describe('find method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should execute find query successfully with filter and projection', async () => {
      const mockResults = [{ _id: 1, name: 'John', age: 25 }];
      mockCollection.toArray.mockResolvedValue(mockResults);

      const result = await adapter.find('users', { age: { $gte: 18 } }, { name: 1, age: 1 });

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.find).toHaveBeenCalledWith({ age: { $gte: 18 } });
      expect(mockCollection.project).toHaveBeenCalledWith({ name: 1, age: 1 });
      expect(mockCollection.limit).toHaveBeenCalledWith(25);
      expect(result).toEqual(mockResults);
    });

    it('should use default empty filter and projection', async () => {
      const mockResults = [{ _id: 1, name: 'John' }];
      mockCollection.toArray.mockResolvedValue(mockResults);

      const result = await adapter.find('users');

      expect(mockCollection.find).toHaveBeenCalledWith({});
      expect(mockCollection.project).toHaveBeenCalledWith({});
      expect(result).toEqual(mockResults);
    });

    it('should handle empty results', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      const result = await adapter.find('users', { name: 'NonExistent' });

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Collection not found');
      mockCollection.toArray.mockRejectedValue(dbError);

      await expect(adapter.find('nonexistent')).rejects.toThrow(
        'MongoDB find operation failed: Collection not found'
      );
    });

    it('should handle unknown errors gracefully', async () => {
      mockCollection.toArray.mockRejectedValue('Unknown error');

      await expect(adapter.find('users')).rejects.toThrow(
        'MongoDB find operation failed: Unknown error'
      );
    });

    it('should apply hard limit of 25 documents', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await adapter.find('users');

      expect(mockCollection.limit).toHaveBeenCalledWith(25);
    });

    it('should work with complex filters', async () => {
      const complexFilter = {
        $and: [
          { age: { $gte: 18 } },
          { status: 'active' },
          { tags: { $in: ['premium', 'vip'] } }
        ]
      };
      mockCollection.toArray.mockResolvedValue([]);

      await adapter.find('users', complexFilter);

      expect(mockCollection.find).toHaveBeenCalledWith(complexFilter);
    });
  });

  describe('insert method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should insert document successfully', async () => {
      const mockResult = { insertedId: 'new_id_123', acknowledged: true };
      mockCollection.insertOne.mockResolvedValue(mockResult);

      const document = { name: 'John', age: 25, email: 'john@example.com' };
      const result = await adapter.insert('users', document);

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.insertOne).toHaveBeenCalledWith(document);
      expect(result).toEqual(mockResult);
    });

    it('should handle insert errors gracefully', async () => {
      const dbError = new Error('Duplicate key error');
      mockCollection.insertOne.mockRejectedValue(dbError);

      const document = { _id: 'existing_id', name: 'John' };
      await expect(adapter.insert('users', document)).rejects.toThrow(
        'MongoDB insert operation failed: Duplicate key error'
      );
    });

    it('should handle unknown insert errors', async () => {
      mockCollection.insertOne.mockRejectedValue('Unknown error');

      await expect(adapter.insert('users', { name: 'John' })).rejects.toThrow(
        'MongoDB insert operation failed: Unknown error'
      );
    });
  });

  describe('update method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should update documents successfully', async () => {
      const mockResult = { matchedCount: 2, modifiedCount: 2, acknowledged: true };
      mockCollection.updateMany.mockResolvedValue(mockResult);

      const filter = { status: 'inactive' };
      const update = { $set: { status: 'active', lastLogin: new Date() } };
      const result = await adapter.update('users', filter, update);

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.updateMany).toHaveBeenCalledWith(filter, update);
      expect(result).toEqual(mockResult);
    });

    it('should handle update errors gracefully', async () => {
      const dbError = new Error('Invalid update operation');
      mockCollection.updateMany.mockRejectedValue(dbError);

      await expect(adapter.update('users', {}, { $invalid: 'operation' })).rejects.toThrow(
        'MongoDB update operation failed: Invalid update operation'
      );
    });

    it('should handle unknown update errors', async () => {
      mockCollection.updateMany.mockRejectedValue('Unknown error');

      await expect(adapter.update('users', {}, { $set: { name: 'updated' } })).rejects.toThrow(
        'MongoDB update operation failed: Unknown error'
      );
    });
  });

  describe('delete method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should delete documents successfully', async () => {
      const mockResult = { deletedCount: 3, acknowledged: true };
      mockCollection.deleteMany.mockResolvedValue(mockResult);

      const filter = { status: 'inactive', lastLogin: { $lt: new Date('2023-01-01') } };
      const result = await adapter.delete('users', filter);

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.deleteMany).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockResult);
    });

    it('should handle delete errors gracefully', async () => {
      const dbError = new Error('Cannot delete documents');
      mockCollection.deleteMany.mockRejectedValue(dbError);

      await expect(adapter.delete('users', {})).rejects.toThrow(
        'MongoDB delete operation failed: Cannot delete documents'
      );
    });

    it('should handle unknown delete errors', async () => {
      mockCollection.deleteMany.mockRejectedValue('Unknown error');

      await expect(adapter.delete('users', { _id: 'test' })).rejects.toThrow(
        'MongoDB delete operation failed: Unknown error'
      );
    });
  });

  describe('listCollections method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should list collections successfully', async () => {
      const mockCollections = [
        { name: 'users', type: 'collection' },
        { name: 'posts', type: 'collection' },
        { name: 'comments', type: 'collection' }
      ];
      mockDb.listCollections().toArray.mockResolvedValue(mockCollections);

      const result = await adapter.listCollections();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.listCollections).toHaveBeenCalled();
      expect(result).toEqual(['users', 'posts', 'comments']);
    });

    it('should handle empty database', async () => {
      mockDb.listCollections().toArray.mockResolvedValue([]);

      const result = await adapter.listCollections();

      expect(result).toEqual([]);
    });

    it('should handle listCollections errors gracefully', async () => {
      const dbError = new Error('Access denied');
      mockDb.listCollections().toArray.mockRejectedValue(dbError);

      await expect(adapter.listCollections()).rejects.toThrow(
        'MongoDB listCollections operation failed: Access denied'
      );
    });

    it('should handle unknown listCollections errors', async () => {
      mockDb.listCollections().toArray.mockRejectedValue('Unknown error');

      await expect(adapter.listCollections()).rejects.toThrow(
        'MongoDB listCollections operation failed: Unknown error'
      );
    });
  });

  describe('close method', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should close connection when connected', async () => {
      // Simulate connected state
      await adapter.connect();
      
      await adapter.close();

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should not call close when not connected', async () => {
      // Not connected, so close should do nothing
      await adapter.close();

      expect(mockClient.close).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      // First connect to set isConnected = true
      await adapter.connect();
      
      const closeError = new Error('Connection already closed');
      mockClient.close.mockRejectedValue(closeError);

      await expect(adapter.close()).rejects.toThrow('Connection already closed');
    });
  });

  describe('Connection state management', () => {
    beforeEach(() => {
      adapter = new MongoAdapter('mongodb://localhost:27017', 'testdb');
    });

    it('should manage connection state correctly', async () => {
      // Initially not connected, should connect
      await adapter.find('users');
      expect(mockClient.connect).toHaveBeenCalledTimes(1);

      // Second operation should not reconnect
      await adapter.find('posts');
      expect(mockClient.connect).toHaveBeenCalledTimes(1);

      // After close and new operation, should reconnect
      await adapter.close();
      await adapter.find('comments');
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should reset connection state on connection failure', async () => {
      // First connection fails
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      await expect(adapter.find('users')).rejects.toThrow('Failed to connect to MongoDB: Connection failed');

      // Second attempt should try to connect again
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockCollection.toArray.mockResolvedValue([]);
      
      await adapter.find('users');
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });
  });
});