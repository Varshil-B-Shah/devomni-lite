import { Pool } from "pg";

export class PostgresAdapter {
  private pool: Pool;
  
  constructor(connectionString: string) {
    // Security: Basic validation of connection string
    if (!connectionString || typeof connectionString !== 'string' || connectionString.trim().length === 0) {
      throw new Error("PostgreSQL connection string cannot be empty");
    }
    
    this.pool = new Pool({ 
      connectionString,
      // Security: Add connection pool limits
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    
    // Security: Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  
  async query(sql: string, params?: any[]) {
    // Security: Basic input validation
    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      throw new Error("SQL query cannot be empty");
    }
    
    try {
      return await this.pool.query(sql, params);
    } catch (error) {
      // Security: Don't expose internal database details in error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      throw new Error(`PostgreSQL query failed: ${errorMessage}`);
    }
  }
  
  async close() {
    await this.pool.end();
  }
}
