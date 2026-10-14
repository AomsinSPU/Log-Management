import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pgDriver from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migration.js';
import { seed } from '../src/seeding.js';
import { postgresDatabase, type Database } from '../src/db.js';
const origin = 'http://localhost:3000';
const passwords = { admin: 'Test-admin-42!', viewerA: 'Test-viewer-A-42!', viewerB: 'Test-viewer-B-42!' };
test('Day 2: migrations, sessions, RBAC and tenant isolation against PostgreSQL WASM', async t => {
 const pg = await PGlite.create();
 const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 10 });
 await socket.start();
 const pool = new pgDriver.Pool({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 });
 const db = postgresDatabase(pool);
 t.after(async () => { await pool.end(); await socket.stop(); await pg.close(); });
 await migrate(db); await migrate(db);
 await seed(db,passwords); await seed(db,passwords);
 const app = createApp(db,{ origin, secureCookie: false });
 async function login(email: string, password: string) {
  const agent = request.agent(app);
  const pre = await agent.get('/api/auth/csrf').expect(200);
  const response = await agent.post('/api/auth/login').set('Origin',origin).set('x-csrf-token',pre.body.csrfToken).send({ email,password }).expect(200);
  return { agent, csrf: response.body.csrfToken, cookie: response.headers['set-cookie'][0].split(';')[0], preCookie: pre.headers['set-cookie'][0].split(';')[0] };
 }
 const a = await login('viewer.a@example.test',passwords.viewerA);
 const b = await login('viewer.b@example.test',passwords.viewerB);
 const admin = await login('admin@example.test',passwords.admin);
 const tenants = (await db.query('SELECT id,slug FROM tenants ORDER BY slug')).rows;
 const ids = [randomUUID(),randomUUID()];
 for (let i=0;i<2;i++) await db.query(`INSERT INTO events(id,tenant_id,event_timestamp,source,event_type,severity,raw,parser_version) VALUES($1,$2,now(),'api','authentication',3,$3,'test-v1')`,[ids[i],tenants[i].id,`secret-${i}`]);
 await t.test('exactly eight tables and idempotent seed without password reset', async () => {
  const tables = await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'"); assert.equal(tables.rows[0].count,8);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count,3);
  await assert.rejects(seed(db,{ ...passwords, admin: 'short' }));
  await assert.rejects(db.query("INSERT INTO tenants(id,slug,name,retention_days) VALUES($1,'bad','bad',6)",[randomUUID()]));
  await assert.rejects(db.transaction(async tx => { await tx.query("INSERT INTO tenants(id,slug,name) VALUES($1,'rollback','Rollback')",[randomUUID()]); throw new Error('abort'); }));
  assert.equal((await db.query("SELECT id FROM tenants WHERE slug='rollback'")).rows.length,0);
 });
 await t.test('readiness and unauthenticated requests', async () => {
  await request(app).get('/health').expect(200); await request(app).get('/ready').expect(200);
  await request(app).get('/api/logs').expect(401); await request(app).get('/api/auth/me').set('Cookie','log_session=forged').expect(401);
 });
 await t.test('session rotates, refresh preserves login, cookie is HttpOnly and SameSite', async () => {
  assert.notEqual(a.cookie,a.preCookie);
  await request(app).get('/api/auth/me').set('Cookie',a.preCookie).expect(401);
  const me = await a.agent.get('/api/auth/me').expect(200); assert.equal(me.body.user.tenant,'demoA');
  const pre = await request(app).get('/api/auth/csrf').expect(200);
  assert.match(pre.headers['set-cookie'][0],/HttpOnly/); assert.match(pre.headers['set-cookie'][0],/SameSite=Lax/);
 });
 await t.test('login rejects invalid password, unknown user and CSRF/Origin violations', async () => {
  const agent = request.agent(app); const pre = await agent.get('/api/auth/csrf');
  const credentials = { email:'viewer.a@example.test',password:'incorrect' };
  await agent.post('/api/auth/login').send(credentials).expect(403);
  await agent.post('/api/auth/login').set('Origin','http://evil.test').set('x-csrf-token',pre.body.csrfToken).send(credentials).expect(403);
  await agent.post('/api/auth/login').set('Origin',origin).set('x-csrf-token',pre.body.csrfToken).send(credentials).expect(401);
  await agent.post('/api/auth/login').set('Origin',origin).set('x-csrf-token',pre.body.csrfToken).send({ email:'unknown@example.test',password:'incorrect' }).expect(401);
 });
 await t.test('viewer lists and details never leak the other tenant', async () => {
  assert.deepEqual((await a.agent.get('/api/logs').expect(200)).body.events.map((e: any)=>e.id),[ids[0]]);
  assert.deepEqual((await b.agent.get('/api/logs').expect(200)).body.events.map((e: any)=>e.id),[ids[1]]);
  await a.agent.get('/api/logs?tenant=demoB').expect(403);
  await a.agent.get('/api/logs').set('x-tenant-id',tenants[1].id).expect(400);
  await a.agent.get('/api/logs?tenant_id='+tenants[1].id).expect(400);
  await a.agent.get('/api/logs/'+ids[1]).expect(404);
  assert.equal((await a.agent.get('/api/tenants').expect(200)).body.tenants.length,1);
 });
 await t.test('admin must explicitly select a real tenant', async () => {
  await admin.agent.get('/api/logs').expect(400);
  await admin.agent.get('/api/logs?tenant=missing').expect(404);
  assert.equal((await admin.agent.get('/api/logs?tenant=demoB').expect(200)).body.events[0].id,ids[1]);
  assert.equal((await admin.agent.get('/api/tenants').expect(200)).body.tenants.length,2);
 });
 let ruleId: string;
 await t.test('writes enforce Admin, CSRF, origin, validation and tenant scope', async () => {
  const rule = { name:'Failed login',threshold:5,window_seconds:300 };
  await a.agent.post('/api/rules').set('Origin',origin).set('x-csrf-token',a.csrf).send(rule).expect(403);
  await admin.agent.post('/api/rules?tenant=demoB').send(rule).expect(403);
  await admin.agent.post('/api/rules?tenant=demoB').set('Origin','http://evil.test').set('x-csrf-token',admin.csrf).send(rule).expect(403);
  await admin.agent.post('/api/rules').set('Origin',origin).set('x-csrf-token',admin.csrf).send(rule).expect(400);
  await admin.agent.post('/api/rules?tenant=demoB').set('Origin',origin).set('x-csrf-token',admin.csrf).send({ ...rule,tenant:'demoA' }).expect(400);
  const result = await admin.agent.post('/api/rules?tenant=demoB').set('Origin',origin).set('x-csrf-token',admin.csrf).send(rule).expect(201);
  ruleId = result.body.rule.id;
  assert.equal((await a.agent.get('/api/rules').expect(200)).body.rules.length,0);
  assert.equal((await b.agent.get('/api/rules').expect(200)).body.rules[0].id,ruleId);
  await a.agent.get('/api/rules?tenant=demoB').expect(403);
 });
 await t.test('database rejects a cross-tenant alert foreign key', async () => {
  await assert.rejects(db.query(`INSERT INTO alerts(id,tenant_id,rule_id,group_key,observed_count,window_start,window_end,first_seen,last_seen) VALUES($1,$2,$3,'ip',5,now()-interval '5 minutes',now(),now(),now())`,[randomUUID(),tenants[0].id,ruleId]));
 });
 await t.test('current role and active state are read from database on every request', async () => {
  await db.query("UPDATE users SET role='viewer' WHERE email='admin@example.test'");
  await admin.agent.get('/api/logs?tenant=demoB').expect(403);
  await db.query("UPDATE users SET is_active=false WHERE email='viewer.b@example.test'");
  await b.agent.get('/api/auth/me').expect(401);
  await db.query("UPDATE users SET is_active=true WHERE email='viewer.b@example.test'");
 });
 await t.test('expired, deleted and logged-out sessions cannot be reused', async () => {
  await a.agent.post('/api/auth/logout').expect(403);
  await a.agent.post('/api/auth/logout').set('Origin',origin).set('x-csrf-token',a.csrf).expect(204);
  await request(app).get('/api/auth/me').set('Cookie',a.cookie).expect(401);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email='viewer.b@example.test')");
  await b.agent.get('/api/auth/me').expect(401);
  await db.query('DELETE FROM sessions'); await admin.agent.get('/api/auth/me').expect(401);
 });
 await t.test('secure configuration and failure responses', async () => {
  assert.throws(()=>createApp(db,{ origin,secureCookie:false,production:true }));
  const secure = createApp(db,{ origin:'https://logs.example.test',secureCookie:true,production:true });
  const pre = await request(secure).get('/api/auth/csrf').expect(200);
  assert.match(pre.headers['set-cookie'][0],/__Host-log_session=.*Secure/);
  await request(app).post('/api/auth/login').set('Content-Type','application/json').send('{invalid').expect(400);
  const unavailable: Database = { query: async()=>{ throw new Error('offline'); },transaction:async()=>{ throw new Error('offline'); } };
  await request(createApp(unavailable,{ origin,secureCookie:false })).get('/ready').expect(503);
 });
});
