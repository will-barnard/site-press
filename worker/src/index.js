import os from 'node:os';
import { config } from './config.js';
import { pool, query } from './db.js';
import { jobLogger } from './events.js';
import { runJob } from './pipeline/run.js';

// One job at a time: Chromium is memory-hungry and dry-dock serialises work
// per machine anyway, so parallel jobs would only queue behind each other.
const WORKER_ID = `${os.hostname()}-${process.pid}`;
let stopping = false;

async function waitForSchema() {
  for (let i = 0; ; i++) {
    try { await query('SELECT 1 FROM jobs LIMIT 1'); return; } catch (err) {
      // The backend owns migrations; wait for it rather than racing it.
      if (i % 10 === 0) console.log(`[worker] waiting for the jobs table (${err.code || err.message})`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// A job left 'running' by a previous worker process died with it (deploy,
// crash, OOM). Say so instead of leaving it spinning forever.
async function failInterrupted() {
  const { rows } = await query(
    `UPDATE jobs SET status = 'failed', error = 'The worker restarted while this job was running. Retry it.', finished_at = now()
      WHERE status = 'running' RETURNING id`,
  );
  for (const r of rows) console.log(`[worker] marked interrupted job ${r.id} as failed`);
}

async function claim() {
  const { rows } = await query(
    `UPDATE jobs SET status = 'running', started_at = now(), worker = $1, stage = 'starting'
      WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`,
    [WORKER_ID],
  );
  return rows[0] || null;
}

const DEFAULT_OPTIONS = { maxPages: 30, viewports: [1440, 768, 375], ai: 'auto', customBlocks: true, maxCustomBlocks: 12, fixLoop: true };

async function loop() {
  await waitForSchema();
  await failInterrupted();
  console.log(`[worker] ${WORKER_ID} ready; template ${config.templateDir}; dry-dock ${config.drydock.baseUrl || '(not configured)'} pool=${config.drydock.pool || 'auto'}`);
  while (!stopping) {
    const job = await claim().catch((err) => { console.error('[worker] claim failed', err.message); return null; });
    if (!job) { await new Promise((r) => setTimeout(r, config.pollMs)); continue; }
    job.options = { ...DEFAULT_OPTIONS, ...(job.options || {}) };
    const log = jobLogger(job.id);
    log.info(`starting ${job.url}`, { options: job.options });
    const t0 = Date.now();
    try {
      const summary = await runJob(job, log);
      log.setStage('done');
      log.info(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
      await log.flush();
      await query("UPDATE jobs SET status = 'done', stage = 'done', progress = 1, summary = $2, finished_at = now() WHERE id = $1", [job.id, summary]);
    } catch (err) {
      const cancelled = Boolean(err.cancelled);
      if (!cancelled) console.error(err);
      log.error(cancelled ? 'cancelled' : `failed: ${err.message}`);
      await log.flush();
      await query('UPDATE jobs SET status = $2, error = $3, finished_at = now() WHERE id = $1', [job.id, cancelled ? 'cancelled' : 'failed', cancelled ? null : err.message.slice(0, 4000)]);
    }
  }
}

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; setTimeout(() => process.exit(0), 2000).unref(); });
loop().catch((err) => { console.error('[worker] fatal', err); pool.end().finally(() => process.exit(1)); });
