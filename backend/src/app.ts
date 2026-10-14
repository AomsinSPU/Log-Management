import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
type User = { id: string; email: string; role: 'admin' | 'viewer'; tenant_id: string; tenant: string };
type Session = { sid: string; data: { csrf: string }; user?: User };
const token = () => randomBytes(32).toString('hex');
const uuid = z.string().uuid();
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function createApp(db: Database, config: { origin: string; secureCookie: boolean; production?: boolean }) {
 if (new URL(config.origin).origin !== config.origin) throw new Error('APP_ORIGIN must be an exact origin');
 if (config.production && (!config.secureCookie || !config.origin.startsWith('https://'))) throw new Error('Production requires HTTPS and secure cookies');
 const app = express();
 app.disable('x-powered-by');
 app.use(helmet());
 app.use(express.json({ limit: '16kb' }));
 const cookieName = config.secureCookie ? '__Host-log_session' : 'log_session';
 const cookieOptions = { httpOnly: true, secure: config.secureCookie, sameSite: 'lax' as const, path: '/' };
 const dummyHash = argon2.hash(token(), { type: argon2.argon2id });
 function sidFrom(req: Request) {
  const value = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
 }
 async function loadSession(req: Request): Promise<Session | undefined> {
  const sid = sidFrom(req); if (!sid) return;
  const { rows } = await db.query(`SELECT s.sid,s.data,s.user_id,u.id,u.email,u.role,u.tenant_id,t.slug AS tenant,u.is_active
   FROM sessions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN tenants t ON t.id=u.tenant_id
   WHERE s.sid=$1 AND s.expires_at > now()`, [sid]);
  const row = rows[0]; if (!row || (row.user_id && !row.is_active)) return;
  return { sid, data: row.data, user: row.user_id ? { id: row.id, email: row.email, role: row.role, tenant_id: row.tenant_id, tenant: row.tenant } : undefined };
 }
 async function requireUser(req: Request) {
  const session = await loadSession(req);
  if (!session?.user) throw new HttpError(401, 'Authentication required');
  return session as Session & { user: User };
 }
 function csrf(req: Request, session: Session) {
  const supplied = req.get('x-csrf-token') ?? '';
  const expected = session.data.csrf ?? '';
  const actualBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected);
  if (req.get('origin') !== config.origin || actualBytes.length !== expectedBytes.length || !expected || !timingSafeEqual(actualBytes, expectedBytes)) throw new HttpError(403, 'CSRF validation failed');
 }
 async function tenantScope(req: Request, user: User) {
  // Accept tenant only in one documented location; reject alternate selectors.
  if (req.get('x-tenant-id') || req.get('x-tenant') || (req.body && ('tenant' in req.body || 'tenant_id' in req.body)) || req.query.tenant_id !== undefined) throw new HttpError(400, 'Use tenant query parameter only');
  const requested = req.query.tenant;
  if (requested !== undefined && (typeof requested !== 'string' || requested.length > 100)) throw new HttpError(400, 'Invalid tenant');
  if (user.role === 'viewer') {
   if (requested !== undefined && requested !== user.tenant) throw new HttpError(403, 'Tenant access denied');
   return user.tenant_id;
  }
  if (!requested) throw new HttpError(400, 'Admin must select tenant');
  const { rows } = await db.query('SELECT id FROM tenants WHERE slug=$1', [requested]);
  if (!rows[0]) throw new HttpError(404, 'Tenant not found');
  return rows[0].id as string;
 }
 app.get('/health', (_req, res) => res.json({ status: 'ok' }));
 app.get('/ready', async (_req, res) => {
  try { await db.query('SELECT id FROM tenants LIMIT 0'); await db.query('SELECT sid FROM sessions LIMIT 0'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ error: 'Database/schema unavailable' }); }
 });
 const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
 app.use('/api/auth/csrf', authLimiter);
 app.use('/api/auth/login', authLimiter);
 app.get('/api/auth/csrf', async (req, res) => {
  let session = await loadSession(req);
  if (!session) {
   session = { sid: token(), data: { csrf: token() } };
   await db.query(`INSERT INTO sessions(sid,data,expires_at) VALUES($1,$2,now()+interval '15 minutes')`, [session.sid, session.data]);
   res.cookie(cookieName, session.sid, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  }
  res.set('Cache-Control', 'no-store').json({ csrfToken: session.data.csrf });
 });
 app.post('/api/auth/login', async (req, res) => {
  const session = await loadSession(req); if (!session) throw new HttpError(403, 'Obtain CSRF token first');
  csrf(req, session);
  const credentials = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(256) }).strict().safeParse(req.body);
  if (!credentials.success) throw new HttpError(400, 'Invalid login payload');
  const { rows } = await db.query('SELECT id,password_hash,is_active FROM users WHERE email=$1', [credentials.data.email]);
  const user = rows[0];
  const valid = await argon2.verify(user?.password_hash ?? await dummyHash, credentials.data.password);
  if (!valid || !user?.is_active) throw new HttpError(401, 'Invalid email or password');
  const next = { sid: token(), csrf: token() };
  await db.transaction(async tx => {
   // Consuming the previous session atomically prevents concurrent replay of login.
   const consumed = await tx.query('DELETE FROM sessions WHERE sid=$1 AND expires_at > now() RETURNING sid', [session.sid]);
   if (!consumed.rows.length) throw new HttpError(403, 'Session already consumed');
   await tx.query(`INSERT INTO sessions(sid,user_id,data,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')`, [next.sid, user.id, { csrf: next.csrf }]);
  });
  res.cookie(cookieName, next.sid, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
  res.set('Cache-Control','no-store').json({ csrfToken: next.csrf });
 });
 app.get('/api/auth/me', async (req, res) => { const session = await requireUser(req); res.set('Cache-Control','no-store').json({ user: session.user }); });
 app.post('/api/auth/logout', async (req, res) => {
  const session = await requireUser(req); csrf(req, session);
  await db.query('DELETE FROM sessions WHERE sid=$1', [session.sid]);
  res.clearCookie(cookieName,cookieOptions).status(204).end();
 });
 app.use('/api', (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });
 app.get('/api/tenants', async (req, res) => {
  const { user } = await requireUser(req);
  const { rows } = user.role === 'admin' ? await db.query('SELECT id,slug,name FROM tenants ORDER BY slug') : await db.query('SELECT id,slug,name FROM tenants WHERE id=$1', [user.tenant_id]);
  res.json({ tenants: rows });
 });
 // Minimal day-2 reads to exercise real data isolation; search/dashboard follow on day 5.
 app.get('/api/logs', async (req, res) => {
  const { user } = await requireUser(req); const tenant = await tenantScope(req,user);
  const { rows } = await db.query('SELECT id,event_timestamp,source,event_type,severity FROM events WHERE tenant_id=$1 ORDER BY event_timestamp DESC,id DESC LIMIT 50', [tenant]);
  res.json({ events: rows });
 });
 app.get('/api/logs/:id', async (req, res) => {
  const { user } = await requireUser(req); const tenant = await tenantScope(req,user);
  const id = uuid.safeParse(req.params.id); if (!id.success) throw new HttpError(400,'Invalid event ID');
  const { rows } = await db.query('SELECT * FROM events WHERE tenant_id=$1 AND id=$2',[tenant,id.data]);
  if (!rows[0]) throw new HttpError(404,'Event not found'); res.json({ event: rows[0] });
 });
 app.get('/api/rules', async (req, res) => {
  const { user } = await requireUser(req); const tenant = await tenantScope(req,user);
  const { rows } = await db.query('SELECT * FROM alert_rules WHERE tenant_id=$1 ORDER BY created_at,id',[tenant]); res.json({ rules: rows });
 });
 app.post('/api/rules', async (req, res) => {
  const session = await requireUser(req);
  if (session.user.role !== 'admin') throw new HttpError(403,'Admin required');
  csrf(req,session); const tenant = await tenantScope(req,session.user);
  const rule = z.object({ name: z.string().trim().min(1).max(200), threshold: z.number().int().min(1).max(100000), window_seconds: z.number().int().min(1).max(86400) }).strict().safeParse(req.body);
  if (!rule.success) throw new HttpError(400,'Invalid rule');
  const { rows } = await db.query(`INSERT INTO alert_rules(id,tenant_id,name,rule_type,threshold,window_seconds,created_by) VALUES(gen_random_uuid(),$1,$2,'failed_login',$3,$4,$5) RETURNING *`, [tenant,rule.data.name,rule.data.threshold,rule.data.window_seconds,session.user.id]);
  res.status(201).json({ rule: rows[0] });
 });
 app.use((_req,res) => res.status(404).json({ error: 'Route not found' }));
 app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
  if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Payload too large' }); return; }
  if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON' }); return; }
  console.error('Request failed', { code: typeof error.code === 'string' ? error.code : 'INTERNAL' });
  res.status(503).json({ error: 'Service unavailable' });
 });
 return app;
}
