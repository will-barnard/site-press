import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { config, ROOT } from './config.js';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ ...config.db, max: 10 });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Numbered .sql files applied on boot and tracked in schema_migrations.
// Not docker-entrypoint-initdb.d: postgres is a Beachhead stateful service, so
// an init script would run once on first volume creation and never again.
export async function migrate() {
  const dir = path.join(ROOT, 'core/server/migrations');
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`[db] applied ${file}`);
  }
}

// Postgres may still be starting when the container boots; retry rather than
// crash-loop, but give up loudly if it's a config problem (auth, wrong db).
export async function waitForDb({ attempts = 30 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try { await query('SELECT 1'); return; } catch (err) {
      if (['28P01', '3D000'].includes(err.code)) throw err;
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
