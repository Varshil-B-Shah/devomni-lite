import { MySQLAdapter } from '../src/mysqlAdapter';

// Mock the mysql2/promise module
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn()
}));

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPool = {
      execute: jest.fn(),
      end: jest.fn()
    };
    
    const mysql = require('mysql2/promise');
    mysql.createPool.mockReturnValue(mockPool);
    
    adapter = new MySQLAdapter({
      host: 'localhost',
      port: 3306,
      user: 'testuser',
      password: 'testpass',
      database: 'testdb'
    });
  });

  describe('Constructor', () => {
    it('should create MySQLAdapter with valid config', () => {
      expect(adapter).toBeInstanceOf(MySQLAdapter);
      expect(require('mysql2/promise').createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        connectionLimit: 10,
        multipleStatements: false
      });
    });

    it('should throw error with null config', () => {
      expect(() => new MySQLAdapter(null as any)).toThrow('MySQL configuration cannot be empty');
    });

    it('should throw error with undefined config', () => {
      expect(() => new MySQLAdapter(undefined as any)).toThrow('MySQL configuration cannot be empty');
    });

    it('should throw error with non-object config', () => {
      expect(() => new MySQLAdapter('invalid' as any)).toThrow('MySQL configuration cannot be empty');
    });

    it('should apply security configurations', () => {
      const mysql = require('mysql2/promise');
      const lastCall = mysql.createPool.mock.calls[mysql.createPool.mock.calls.length - 1][0];
      
      expect(lastCall.connectionLimit).toBe(10);
      expect(lastCall.multipleStatements).toBe(false);
    });

    it('should merge user config with security defaults', () => {
      const customConfig = {
        host: 'custom.host.com',
        port: 3307,
        user: 'customuser',
        password: 'custompass',
        database: 'customdb',
        charset: 'utf8mb4'
      };

      new MySQLAdapter(customConfig);

      const mysql = require('mysql2/promise');
      const lastCall = mysql.createPool.mock.calls[mysql.createPool.mock.calls.length - 1][0];
      
      expect(lastCall).toEqual({
        ...customConfig,
        connectionLimit: 10,
        multipleStatements: false
      });
    });
  });

  describe('query method', () => {
    it('should execute query successfully with parameters', async () => {
      const mockRows = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
      mockPool.execute.mockResolvedValue([mockRows, []]);

      const result = await adapter.query('SELECT * FROM users WHERE active = ?', [true]);

      expect(mockPool.execute).toHaveBeenCalledWith('SELECT * FROM users WHERE active = ?', [true]);
      expect(result).toEqual({ rows: mockRows });
    });

    it('should execute query successfully without parameters', async () => {
      const mockRows = [{ count: 5 }];
      mockPool.execute.mockResolvedValue([mockRows, []]);

      const result = await adapter.query('SELECT COUNT(*) as count FROM users');

      expect(mockPool.execute).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM users', undefined);
      expect(result).toEqual({ rows: mockRows });
    });

    it('should throw error for empty query', async () => {
      await expect(adapter.query('')).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.execute).not.toHaveBeenCalled();
    });

    it('should throw error for whitespace-only query', async () => {
      await expect(adapter.query('   \n\t  ')).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.execute).not.toHaveBeenCalled();
    });

    it('should throw error for null query', async () => {
      await expect(adapter.query(null as any)).rejects.toThrow('SQL query cannot be empty');
      expect(mockPool.execute).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error("Table 'testdb.nonexistent' doesn't exist");
      mockPool.execute.mockRejectedValue(dbError);

      await expect(adapter.query('SELECT * FROM nonexistent')).rejects.toThrow(
        "MySQL query failed: Table 'testdb.nonexistent' doesn't exist"
      );
    });

    it('should handle unknown errors gracefully', async () => {
      mockPool.execute.mockRejectedValue('Unknown error');

      await expect(adapter.query('SELECT * FROM users')).rejects.toThrow(
        'MySQL query failed: Unknown database error'
      );
    });

    it('should handle queries with multiple parameters', async () => {
      const mockRows = [{ id: 1, name: 'John', age: 25 }];
      mockPool.execute.mockResolvedValue([mockRows, []]);

      const result = await adapter.query(
        'SELECT * FROM users WHERE age > ? AND city = ? AND active = ?',
        [18, 'New York', 1]
      );

      expect(mockPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE age > ? AND city = ? AND active = ?',
        [18, 'New York', 1]
      );
      expect(result).toEqual({ rows: mockRows });
    });

    it('should handle empty result sets', async () => {
      mockPool.execute.mockResolvedValue([[], []]);

      const result = await adapter.query('SELECT * FROM users WHERE id = ?', [999]);

      expect(result).toEqual({ rows: [] });
    });

    it('should handle INSERT queries', async () => {
      const mockResult = { insertId: 1, affectedRows: 1 };
      mockPool.execute.mockResolvedValue([mockResult, []]);

      const result = await adapter.query(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John Doe', 'john@example.com']
      );

      expect(result).toEqual({ rows: mockResult });
    });

    it('should handle UPDATE queries', async () => {
      const mockResult = { affectedRows: 2, changedRows: 2 };
      mockPool.execute.mockResolvedValue([mockResult, []]);

      const result = await adapter.query('UPDATE users SET active = ? WHERE age < ?', [0, 18]);

      expect(result).toEqual({ rows: mockResult });
    });

    it('should handle DELETE queries', async () => {
      const mockResult = { affectedRows: 1 };
      mockPool.execute.mockResolvedValue([mockResult, []]);

      const result = await adapter.query('DELETE FROM users WHERE id = ?', [5]);

      expect(result).toEqual({ rows: mockResult });
    });
  });

  describe('close method', () => {
    it('should close the connection pool', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await adapter.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const closeError = new Error('Pool is already closed');
      mockPool.end.mockRejectedValue(closeError);

      await expect(adapter.close()).rejects.toThrow('Pool is already closed');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple queries in sequence', async () => {
      const results = [
        [[{ id: 1, name: 'John' }], []],
        [[{ id: 2, name: 'Jane' }], []],
        [[{ id: 3, name: 'Bob' }], []]
      ];

      mockPool.execute
        .mockResolvedValueOnce(results[0])
        .mockResolvedValueOnce(results[1])
        .mockResolvedValueOnce(results[2]);

      const result1 = await adapter.query('SELECT * FROM users WHERE id = ?', [1]);
      const result2 = await adapter.query('SELECT * FROM users WHERE id = ?', [2]);
      const result3 = await adapter.query('SELECT * FROM users WHERE id = ?', [3]);

      expect(result1.rows).toEqual(results[0][0]);
      expect(result2.rows).toEqual(results[1][0]);
      expect(result3.rows).toEqual(results[2][0]);
      expect(mockPool.execute).toHaveBeenCalledTimes(3);
    });

    it('should work with complex JOIN queries', async () => {
      const mockRows = [{
        userId: 1,
        userName: 'John',
        postId: 1,
        postTitle: 'My First Post'
      }];
      mockPool.execute.mockResolvedValue([mockRows, []]);

      const result = await adapter.query(`
        SELECT u.id as userId, u.name as userName, p.id as postId, p.title as postTitle
        FROM users u
        JOIN posts p ON u.id = p.user_id
        WHERE u.active = ? AND p.published = ?
      `, [1, 1]);

      expect(result.rows).toEqual(mockRows);
    });
  });
});