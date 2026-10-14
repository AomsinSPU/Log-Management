import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Database } from './db.js';
export const migrationSql = () => readFile(resolve('backend/migrations/001_initial.sql'), 'utf8');
export async function migrate(db: Database) {
 const sql = await migrationSql();
 const version = '001:' + createHash('sha256').update(sql).digest('hex');
 await db.transaction(async tx => {
  await tx.query('SELECT pg_advisory_xact_lock(170014)');
  const { rows } = await tx.query("SELECT to_regclass('public.tenants') AS existing");
  if (rows[0].existing) {
   const result = await tx.query("SELECT obj_description('public.tenants'::regclass) AS version");
   if (result.rows[0].version !== version) throw new Error('Schema migration checksum mismatch');
   return;
  }
  await tx.query(sql);
  await tx.query(`COMMENT ON TABLE tenants IS '${version}'`);
 });
}
