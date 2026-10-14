import { connect } from './db.js';
import { seed } from './seeding.js';
const { pool, db } = connect();
try {
 await seed(db, { admin: process.env.SEED_ADMIN_PASSWORD ?? '', viewerA: process.env.SEED_VIEWER_A_PASSWORD ?? '', viewerB: process.env.SEED_VIEWER_B_PASSWORD ?? '' });
 console.log('Seed ready (existing accounts unchanged)');
} catch { console.error('Seed failed; verify database and seed password configuration'); process.exitCode = 1; }
finally { await pool.end(); }
