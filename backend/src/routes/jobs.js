import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireUser } from '../auth.js';

export const jobsRouter = express.Router();
jobsRouter.use('/jobs', requireUser());

const UUID = /^[0-9a-f-]{36}$/;
const jobDir = (id) => path.join(config.jobsDir, id);
const COLUMNS = 'id, url, status, stage, progress, options, summary, error, worker, cancel_requested, created_at, started_at, finished_at';

// Admin-only, but still: the worker fetches whatever URL is submitted, from
// inside the Docker network. Refuse the obvious internal targets unless
// ALLOW_PRIVATE_URLS=1 (e.g. to rebuild a site on your LAN).
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return { error: 'That isn\'t a valid URL.' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Only http(s) URLs.' };
  const h = u.hostname;
  const internal = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/.test(h) || !h.includes('.') || ['postgres', 'backend', 'frontend', 'worker'].includes(h);
  if (internal && !config.allowPrivateUrls) return { error: 'That address is on a private network. Set ALLOW_PRIVATE_URLS=1 to allow it.' };
  u.hash = '';
  return { url: u.href };
}

function cleanOptions(o = {}) {
  const vps = Array.isArray(o.viewports) ? o.viewports.map(Number).filter((v) => v >= 320 && v <= 2560) : [1440, 768, 375];
  return {
    maxPages: Math.min(200, Math.max(1, Number(o.maxPages) || 30)),
    viewports: vps.length ? [...new Set(vps)].slice(0, 4) : [1440, 768, 375],
    ai: ['off', 'auto', 'all'].includes(o.ai) ? o.ai : 'auto',
    customBlocks: o.customBlocks !== false,
    maxCustomBlocks: Math.min(40, Math.max(0, Number(o.maxCustomBlocks ?? 12))),
    fixLoop: o.fixLoop !== false,
  };
}

jobsRouter.get('/jobs', async (req, res, next) => {
  try { res.json((await query(`SELECT ${COLUMNS} FROM jobs ORDER BY created_at DESC LIMIT 100`)).rows); } catch (err) { next(err); }
});

jobsRouter.post('/jobs', async (req, res, next) => {
  try {
    const { url, error } = checkUrl(req.body?.url);
    if (error) return res.status(422).json({ error });
    const { rows } = await query(`INSERT INTO jobs (url, options, created_by) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [url, cleanOptions(req.body?.options), req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

jobsRouter.param('id', (req, res, next, id) => (UUID.test(id) ? next() : res.status(404).json({ error: 'Not found' })));

jobsRouter.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = (await query(`SELECT ${COLUMNS} FROM jobs WHERE id = $1`, [req.params.id])).rows[0];
    if (!job) return res.status(404).json({ error: 'Not found' });
    const ahead = job.status === 'queued' ? (await query("SELECT count(*)::int AS n FROM jobs WHERE status IN ('queued', 'running') AND created_at < $1", [job.created_at])).rows[0].n : 0;
    res.json({ ...job, queueAhead: ahead });
  } catch (err) { next(err); }
});

jobsRouter.get('/jobs/:id/events', async (req, res, next) => {
  try {
    const after = Number(req.query.after || 0);
    res.json((await query('SELECT id, at, stage, level, message FROM job_events WHERE job_id = $1 AND id > $2 ORDER BY id LIMIT 500', [req.params.id, after])).rows);
  } catch (err) { next(err); }
});

jobsRouter.post('/jobs/:id/cancel', async (req, res, next) => {
  try {
    // Queued: cancel outright. Running: flag it; the worker checks between steps.
    const { rows } = await query(
      `UPDATE jobs SET cancel_requested = true,
              status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
              finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END
        WHERE id = $1 AND status IN ('queued', 'running') RETURNING ${COLUMNS}`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(409).json({ error: 'Only queued or running jobs can be cancelled.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

jobsRouter.post('/jobs/:id/retry', async (req, res, next) => {
  try {
    const old = (await query('SELECT url, options FROM jobs WHERE id = $1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(`INSERT INTO jobs (url, options, created_by) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [old.url, cleanOptions({ ...old.options, ...(req.body?.options || {}) }), req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

jobsRouter.delete('/jobs/:id', async (req, res, next) => {
  try {
    const { rows } = await query("DELETE FROM jobs WHERE id = $1 AND status <> 'running' RETURNING id", [req.params.id]);
    if (!rows[0]) return res.status(409).json({ error: 'Running jobs can\'t be deleted; cancel first.' });
    await fsp.rm(jobDir(req.params.id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Downloads stream from the shared jobs volume.
jobsRouter.get('/jobs/:id/download/:what(site|report)', async (req, res, next) => {
  try {
    const job = (await query('SELECT status, summary FROM jobs WHERE id = $1', [req.params.id])).rows[0];
    if (!job || job.status !== 'done') return res.status(404).json({ error: 'Not ready' });
    const file = path.join(jobDir(req.params.id), `${req.params.what}.tar.gz`);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) return res.status(410).json({ error: 'The archive is gone from the jobs volume. Retry the job (or fetch it from brew-bucket).' });
    const name = req.params.what === 'site' ? `${job.summary?.slug || 'site'}-site.tar.gz` : `${job.summary?.slug || 'site'}-report.tar.gz`;
    res.set({ 'content-type': 'application/gzip', 'content-length': st.size, 'content-disposition': `attachment; filename="${name}"` });
    fs.createReadStream(file).pipe(res);
  } catch (err) { next(err); }
});

// The HTML report and its images, behind the same session.
jobsRouter.use('/jobs/:id/report', (req, res, next) => express.static(path.join(jobDir(req.params.id), 'report'), { index: 'index.html', fallthrough: false })(req, res, next));
