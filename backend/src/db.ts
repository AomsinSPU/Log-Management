import 'dotenv/config';
import pg from 'pg';
export interface Database {
 query<T extends Record<string, any> = Record<string, any>>(sql: string, values?: any[]): Promise<{ rows: T[] }>;
 transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
}
export function postgresDatabase(pool: pg.Pool): Database {
 return {
  query: (sql, values) => pool.query(sql, values),
  async transaction(fn) {
   const client = await pool.connect();
   const db: Database = { query: (sql, values) => client.query(sql, values), transaction: async () => { throw new Error('Nested transaction unsupported'); } };
   try { await client.query('BEGIN'); const result = await fn(db); await client.query('COMMIT'); return result; }
   catch (error) { await client.query('ROLLBACK'); throw error; }
   finally { client.release(); }
  }
 };
}
export function connect() {
 if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
 const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
 pool.on('error', () => console.error('Database pool connection error'));
 return { pool, db: postgresDatabase(pool) };
}
