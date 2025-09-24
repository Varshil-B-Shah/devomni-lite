import { PostgresAdapter } from './postgresAdapter.js';

const db = new PostgresAdapter(process.env.PG_CONNECTION_STRING!);

(async () => {
  const result = await db.query('SELECT * FROM users');
  console.log(result.rows);
  await db.close();
})();
