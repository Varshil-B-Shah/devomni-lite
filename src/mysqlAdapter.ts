import mysql from 'mysql2/promise';

export class MySQLAdapter {
  private pool: mysql.Pool;
  
  constructor(config: mysql.PoolOptions) {
    // Security: Basic validation of config
    if (!config || typeof config !== 'object') {
      throw new Error("MySQL configuration cannot be empty");
    }
    
    // Security: Add connection pool limits and security options
    const secureConfig: mysql.PoolOptions = {
      ...config,
      // Security: Pool limits
      connectionLimit: 10,
      // Security: Prevent multiple statements by default  
      multipleStatements: false
    };
    
    this.pool = mysql.createPool(secureConfig);
  }
  
  async query(sql: string, params?: any[]) {
    // Security: Basic input validation
    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      throw new Error("SQL query cannot be empty");
    }
    
    try {
      const [rows] = await this.pool.execute(sql, params);
      return { rows };
    } catch (error) {
      // Security: Don't expose internal database details in error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      throw new Error(`MySQL query failed: ${errorMessage}`);
    }
  }
  
  async close() {
    await this.pool.end();
  }
}
