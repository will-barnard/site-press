import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ ...config.db, max: 10 });
pool.on('error', (err) => console.error('[db] idle client error', err.message));
export const query = (text, params) => pool.query(text, params);

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Numbered migrations on boot, tracked in schema_migrations. The backend
// owns the schema; the worker waits for it.
export async function migrate() {
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const file of (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await fs.readFile(path.join(MIGRATIONS, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[db] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }
}

export async function waitForDb() {
  for (let i = 1; ; i++) {
    try { await query('SELECT 1'); return; } catch (err) {
      if (['28P01', '3D000'].includes(err.code) || i >= 30) throw err; // bad password / missing db: config, not timing
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
