import { PostgresAdapter } from '../src/postgresAdapter';

// Mock the pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  }))
}));

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter;
  let mockPool: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Get the mocked Pool constructor
    const { Pool } = require('pg');
    mockPool = {
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    };
    
    // Make Pool constructor return our mock
    (Pool as jest.Mock).mockImplementation(() => mockPool);
    
    adapter = new PostgresAdapter('postgresql://test:password@localhost:5432/testdb');
  });

  describe('Constructor', () => {
    it('should create PostgresAdapter with valid connection string', () => {
      expect(adapter).toBeInstanceOf(PostgresAdapter);
      expect(require('pg').Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:password@localhost:5432/testdb',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
    });

    it('should throw error with empty connection string', () => {
      expect(() => new PostgresAdapter('')).toThrow('PostgreSQL connection string cannot be empty');
    });

    it('should throw error with null connection string', () => {
      expect(() => new PostgresAdapter(null as any)).toThrow('PostgreSQL connection string cannot be empty');
    });

    it('should throw error with undefined connection string', () => {
      expect(() => new PostgresAdapter(undefined as any)).toThrow('PostgreSQL connection string cannot be empty');
    });

    it('should setup error handler on pool', () => {
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('query method', () => {
    it('should execute query successfully with parameters', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await adapter.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('should execute query successfully without parameters', async () => {
      const mockResult = { rows: [{ count: 5 }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await adapter.query('SELECT COUNT(*) FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM users', undefined);
      expect(result).toEqual(mockResult);
    });

    it('should throw error for empty query', async () => {
      await expect(adapter.query('')).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error for whitespace-only query', async () => {
      await expect(adapter.query('   \n\t  ')).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error for null query', async () => {
      await expect(adapter.query(null as any)).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('relation "nonexistent" does not exist');
      mockPool.query.mockRejectedValue(dbError);

      await expect(adapter.query('SELECT * FROM nonexistent')).rejects.toThrow(
        'PostgreSQL query failed: relation "nonexistent" does not exist'
      );
    });

    it('should handle unknown errors gracefully', async () => {
      mockPool.query.mockRejectedValue('Unknown error');

      await expect(adapter.query('SELECT * FROM users')).rejects.toThrow(
        'PostgreSQL query failed: Unknown database error'
      );
    });

    it('should handle complex queries with multiple parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await adapter.query(
        'SELECT * FROM users WHERE age > $1 AND city = $2 AND active = $3',
        [18, 'New York', true]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE age > $1 AND city = $2 AND active = $3',
        [18, 'New York', true]
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('close method', () => {
    it('should close the connection pool', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await adapter.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const closeError = new Error('Connection already closed');
      mockPool.end.mockRejectedValue(closeError);

      // Should not throw, just complete
      await expect(adapter.close()).rejects.toThrow('Connection already closed');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple queries in sequence', async () => {
      const results = [
        { rows: [{ id: 1 }], rowCount: 1 },
        { rows: [{ id: 2 }], rowCount: 1 },
        { rows: [{ id: 3 }], rowCount: 1 }
      ];

      mockPool.query
        .mockResolvedValueOnce(results[0])
        .mockResolvedValueOnce(results[1])
        .mockResolvedValueOnce(results[2]);

      const result1 = await adapter.query('SELECT * FROM users WHERE id = $1', [1]);
      const result2 = await adapter.query('SELECT * FROM users WHERE id = $1', [2]);
      const result3 = await adapter.query('SELECT * FROM users WHERE id = $1', [3]);

      expect(result1).toEqual(results[0]);
      expect(result2).toEqual(results[1]);
      expect(result3).toEqual(results[2]);
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should work with transaction-like queries', async () => {
      const beginResult = { rows: [], rowCount: 0 };
      const insertResult = { rows: [{ id: 1 }], rowCount: 1 };
      const commitResult = { rows: [], rowCount: 0 };

      mockPool.query
        .mockResolvedValueOnce(beginResult)
        .mockResolvedValueOnce(insertResult)
        .mockResolvedValueOnce(commitResult);

      await adapter.query('BEGIN');
      const insertRes = await adapter.query('INSERT INTO users (name) VALUES ($1) RETURNING id', ['John']);
      await adapter.query('COMMIT');

      expect(insertRes).toEqual(insertResult);
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });
  });
});