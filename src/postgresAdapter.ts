// src/postgresAdapter.ts
import { Pool } from "pg";

export class PostgresAdapter {
  private pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }
  async query(sql: string, params?: any[]) {
    return this.pool.query(sql, params);
  }
  async close() {
    await this.pool.end();
  }
}
