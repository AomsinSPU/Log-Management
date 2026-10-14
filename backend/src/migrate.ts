import { connect } from './db.js';
import { migrate } from './migration.js';
const { pool, db } = connect();
try { await migrate(db); console.log('Migration 001 ready'); }
catch { console.error('Migration failed; verify database and schema'); process.exitCode = 1; }
finally { await pool.end(); }
