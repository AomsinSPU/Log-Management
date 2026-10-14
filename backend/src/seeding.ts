import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Database } from './db.js';
export async function seed(db: Database, passwords: { admin: string; viewerA: string; viewerB: string }) {
 for (const password of Object.values(passwords)) if (password.length < 12 || password.length > 256) throw new Error('Seed passwords must be 12–256 characters');
 const accounts = [ ['admin@example.test', 'admin', 'demoA', passwords.admin], ['viewer.a@example.test', 'viewer', 'demoA', passwords.viewerA], ['viewer.b@example.test', 'viewer', 'demoB', passwords.viewerB] ];
 const hashes = await Promise.all(accounts.map(a => argon2.hash(a[3], { type: argon2.argon2id })));
 await db.transaction(async tx => {
  for (const slug of ['demoA','demoB']) await tx.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING', [randomUUID(),slug,`Tenant ${slug.slice(-1)}`]);
  for (const [i, a] of accounts.entries()) {
   const { rows } = await tx.query('SELECT id FROM tenants WHERE slug=$1', [a[2]]);
   await tx.query('INSERT INTO users(id,tenant_id,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING', [randomUUID(), rows[0].id, a[0], a[1], hashes[i]]);
  }
 });
}
