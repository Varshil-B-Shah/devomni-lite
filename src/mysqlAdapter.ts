import mysql from 'mysql2/promise';

export class MySQLAdapter {
  private pool: mysql.Pool;
  constructor(config: mysql.PoolOptions) {
    this.pool = mysql.createPool(config);
  }
  async query(sql: string, params?: any[]) {
    const [rows] = await this.pool.execute(sql, params);
    return { rows };
  }
  async close() {
    await this.pool.end();
  }
}
