import { connect } from './db.js';
import { createApp } from './app.js';
const { pool, db } = connect();
const app = createApp(db, { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', secureCookie: process.env.COOKIE_SECURE === 'true', production: process.env.REQUIRE_HTTPS === 'true' });
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = app.listen(port, () => console.log(`Backend listening on port ${port}`));
const cleanup = setInterval(() => { void db.query('DELETE FROM sessions WHERE expires_at <= now()').catch(() => console.error('Session cleanup failed')); }, 60_000);
cleanup.unref();
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
 clearInterval(cleanup); server.close(() => { void pool.end(); });
 setTimeout(() => process.exit(1), 10000).unref();
});
