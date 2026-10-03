import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireUser } from '../auth.js';

export const systemRouter = express.Router();

// Status for the UI's header: is dry-dock reachable, is brew-bucket wired,
// what's queued. dry-dock's /health is auth + liveness only (it says ok
// with zero workers online), so this can't promise the coder pool is awake.
systemRouter.get('/system', requireUser(), async (req, res, next) => {
  try {
    let drydock = { configured: Boolean(config.drydock.baseUrl && config.drydock.apiKey), pool: config.drydock.pool || 'auto' };
    if (drydock.configured) {
      try {
        const r = await fetch(`${config.drydock.baseUrl}/api/v1/generate/health`, { headers: { 'x-api-key': config.drydock.apiKey }, signal: AbortSignal.timeout(5000) });
        drydock = { ...drydock, reachable: r.ok, status: r.status };
      } catch (err) { drydock = { ...drydock, reachable: false, error: err.message }; }
    }
    const q = (await query("SELECT count(*) FILTER (WHERE status = 'queued')::int AS queued, count(*) FILTER (WHERE status = 'running')::int AS running FROM jobs")).rows[0];
    res.json({ drydock, brewBucket: config.brewBucket, queue: q });
  } catch (err) { next(err); }
});
