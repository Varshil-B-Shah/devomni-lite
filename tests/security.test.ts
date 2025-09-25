import { 
  UnifiedQuerySchema, 
  CompareDatabasesSchema, 
  validateInput 
} from '../src/inputValidator';

describe('DevOmni Lite Security Tests', () => {
  describe('MongoDB Security', () => {
    describe('Valid Queries', () => {
      it('should accept valid MongoDB queries with filters and projections', () => {
        const validQuery = {
          database: 'mongo',
          collection: 'users',
          filter: { age: { $gte: 18 } },
          projection: { name: 1, email: 1 }
        };

        expect(() => validateInput(UnifiedQuerySchema, validQuery)).not.toThrow();
      });

      it('should accept queries with complex valid operators', () => {
        const complexQuery = {
          database: 'mongo',
          collection: 'products',
          filter: { 
            $and: [
              { price: { $lt: 1000 } },
              { category: { $in: ['electronics', 'books'] } }
            ]
          }
        };

        expect(() => validateInput(UnifiedQuerySchema, complexQuery)).not.toThrow();
      });
    });

    describe('Dangerous Operator Blocking', () => {
      it('should block $where operator', () => {
        const dangerousQuery = {
          database: 'mongo',
          collection: 'users',
          filter: { $where: "this.username == 'admin'" }
        };

        expect(() => validateInput(UnifiedQuerySchema, dangerousQuery))
          .toThrow(/Security.*Dangerous MongoDB operator '\$where'/);
      });

      it('should block $eval operator', () => {
        const dangerousQuery = {
          database: 'mongo',
          collection: 'users',
          filter: { $eval: "db.users.drop()" }
        };

        expect(() => validateInput(UnifiedQuerySchema, dangerousQuery))
          .toThrow(/Security.*Dangerous MongoDB operator '\$eval'/);
      });

      it('should block $javascript operator', () => {
        const dangerousQuery = {
          database: 'mongo',
          collection: 'users',
          filter: { $javascript: "return this.password" }
        };

        expect(() => validateInput(UnifiedQuerySchema, dangerousQuery))
          .toThrow(/Security.*Dangerous MongoDB operator '\$javascript'/);
      });

      it('should block $function operator', () => {
        const dangerousQuery = {
          database: 'mongo',
          collection: 'users',
          filter: { $function: { body: "return this.password" } }
        };

        expect(() => validateInput(UnifiedQuerySchema, dangerousQuery))
          .toThrow(/Security.*Dangerous MongoDB operator '\$function'/);
      });
    });

    describe('Nested Attack Detection', () => {
      it('should detect dangerous operators in nested $and queries', () => {
        const nestedAttack = {
          database: 'mongo',
          collection: 'users',
          filter: {
            $and: [
              { status: 'active' },
              { $where: 'this.password.length > 0' }
            ]
          }
        };

        expect(() => validateInput(UnifiedQuerySchema, nestedAttack))
          .toThrow(/Security.*Dangerous MongoDB operator '\$where'/);
      });

      it('should detect dangerous operators in deeply nested structures', () => {
        const deeplyNested = {
          database: 'mongo',
          collection: 'users',
          filter: {
            $or: [
              { level: 1 },
              { 
                $and: [
                  { verified: true },
                  { $eval: 'db.users.count()' }
                ]
              }
            ]
          }
        };

        expect(() => validateInput(UnifiedQuerySchema, deeplyNested))
          .toThrow(/Security.*Dangerous MongoDB operator '\$eval'/);
      });
    });

    describe('Collection Name Validation', () => {
      it('should block path traversal in collection names', () => {
        const pathTraversalQuery = {
          database: 'mongo',
          collection: '../../../etc/passwd',
          filter: {}
        };

        expect(() => validateInput(UnifiedQuerySchema, pathTraversalQuery))
          .toThrow(/Collection name contains invalid characters/);
      });

      it('should block system collection access', () => {
        const systemQuery = {
          database: 'mongo',
          collection: 'system.indexes',
          filter: {}
        };

        expect(() => validateInput(UnifiedQuerySchema, systemQuery))
          .toThrow(/Cannot access system collections/);
      });

      it('should block collections starting with dot', () => {
        const dotQuery = {
          database: 'mongo',
          collection: '.hidden',
          filter: {}
        };

        expect(() => validateInput(UnifiedQuerySchema, dotQuery))
          .toThrow(/Collection name cannot start with \./);
      });

      it('should block collections with double dots', () => {
        const doubleDotQuery = {
          database: 'mongo',
          collection: 'test..collection',
          filter: {}
        };

        expect(() => validateInput(UnifiedQuerySchema, doubleDotQuery))
          .toThrow(/Collection name cannot contain '\.\.'/);
      });

      it('should accept valid collection names', () => {
        const validNames = ['users', 'user_profiles', 'products-2024', 'data123'];
        
        validNames.forEach(collectionName => {
          const validQuery = {
            database: 'mongo',
            collection: collectionName,
            filter: {}
          };

          expect(() => validateInput(UnifiedQuerySchema, validQuery)).not.toThrow();
        });
      });
    });
  });

  describe('SQL Security', () => {
    describe('Valid SQL Queries', () => {
      it('should accept valid PostgreSQL queries', () => {
        const validQuery = {
          database: 'postgres',
          query: 'SELECT id, name FROM users WHERE age > $1'
        };

        expect(() => validateInput(UnifiedQuerySchema, validQuery)).not.toThrow();
      });

      it('should accept valid MySQL queries', () => {
        const validQuery = {
          database: 'mysql',
          query: 'SELECT * FROM products WHERE price BETWEEN ? AND ?'
        };

        expect(() => validateInput(UnifiedQuerySchema, validQuery)).not.toThrow();
      });
    });

    describe('SQL Input Validation', () => {
      it('should reject empty SQL queries', () => {
        const emptyQuery = {
          database: 'postgres',
          query: ''
        };

        expect(() => validateInput(UnifiedQuerySchema, emptyQuery))
          .toThrow(/SQL query cannot be empty/);
      });

      it('should reject queries that are too long', () => {
        const longQuery = {
          database: 'postgres',
          query: 'SELECT * FROM users WHERE ' + 'id = 1 AND '.repeat(1000) + 'active = true'
        };

        expect(() => validateInput(UnifiedQuerySchema, longQuery))
          .toThrow(/SQL query too long/);
      });
    });

    describe('Suspicious SQL Pattern Detection', () => {
      // Note: These patterns are logged but allowed
      it('should log suspicious DROP TABLE patterns', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        const suspiciousQuery = {
          database: 'postgres',
          query: 'DROP TABLE users; --'
        };

        expect(() => validateInput(UnifiedQuerySchema, suspiciousQuery)).not.toThrow();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[SECURITY] Suspicious SQL pattern detected')
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Database Type Validation', () => {
    it('should reject invalid database types', () => {
      const invalidQuery = {
        database: 'redis',
        query: 'GET user:1'
      };

      expect(() => validateInput(UnifiedQuerySchema, invalidQuery))
        .toThrow(/Database must be 'postgres', 'mysql', or 'mongo'/);
    });

    it('should accept all valid database types', () => {
      const databases = ['postgres', 'mysql', 'mongo'];
      
      databases.forEach(db => {
        const query = db === 'mongo' 
          ? { database: db, collection: 'test', filter: {} }
          : { database: db, query: 'SELECT 1' };

        expect(() => validateInput(UnifiedQuerySchema, query)).not.toThrow();
      });
    });
  });

  describe('Cross-Database Validation', () => {
    it('should require collection for MongoDB queries', () => {
      const invalidMongo = {
        database: 'mongo',
        filter: {}
        // Missing collection
      };

      expect(() => validateInput(UnifiedQuerySchema, invalidMongo))
        .toThrow(/Collection name is required for MongoDB queries/);
    });

    it('should require query for SQL databases', () => {
      const invalidSQL = {
        database: 'postgres'
        // Missing query
      };

      expect(() => validateInput(UnifiedQuerySchema, invalidSQL))
        .toThrow(/SQL query is required for PostgreSQL\/MySQL/);
    });
  });

  describe('Compare Databases Schema', () => {
    it('should validate compare databases with valid inputs', () => {
      const validComparison = {
        db1: 'postgres',
        db2: 'mysql',
        query1: 'SELECT COUNT(*) FROM users',
        query2: 'SELECT COUNT(*) FROM users'
      };

      expect(() => validateInput(CompareDatabasesSchema, validComparison)).not.toThrow();
    });

    it('should validate mixed database comparison (SQL + MongoDB)', () => {
      const mixedComparison = {
        db1: 'postgres',
        db2: 'mongo',
        query1: 'SELECT * FROM users',
        collection2: 'users',
        filter2: { active: true }
      };

      expect(() => validateInput(CompareDatabasesSchema, mixedComparison)).not.toThrow();
    });

    it('should require appropriate fields for each database in comparison', () => {
      const invalidComparison = {
        db1: 'mongo',
        db2: 'postgres'
        // Missing collection1 for mongo, query2 for postgres
      };

      expect(() => validateInput(CompareDatabasesSchema, invalidComparison))
        .toThrow(/Collection name is required for MongoDB \(db1\)/);
    });
  });
});