import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Busboy from 'busboy';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { requireUser, requireCsrfHeader, hashPassword } from '../auth.js';
import { cleanBlock } from '../blocks.js';
import { sanitizeRich } from '../sanitize.js';
import { media } from '../media/index.js';
import { parse as parseImage } from '../media/image-size.js';

export const adminRouter = express.Router();

// Order matters: auth + CSRF first for everything under /api/admin, then a
// JSON parser for every route EXCEPT the media upload, which streams its body
// through busboy and would be consumed by a parser mounted ahead of it.
adminRouter.use('/api/admin', requireUser(), requireCsrfHeader);
const json = express.json({ limit: '4mb' });

const PATH_RE = /^\/([a-z0-9][a-z0-9\-_.]*(\/[a-z0-9][a-z0-9\-_.]*)*)?$/;
function badRequest(message, details) { return Object.assign(new Error(message), { status: 422, details }); }

async function loadPage(client, id) {
  const page = (await client.query('SELECT id, path, title, seo, status, updated_at FROM pages WHERE id = $1', [id])).rows[0];
  if (!page) return null;
  page.blocks = (await client.query('SELECT id, type, variant, props FROM blocks WHERE page_id = $1 ORDER BY position', [id])).rows;
  return page;
}

// ── pages ────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/pages', async (req, res, next) => {
  try {
    res.json((await query('SELECT id, path, title, status, updated_at FROM pages ORDER BY path')).rows);
  } catch (err) { next(err); }
});

adminRouter.post('/api/admin/pages', json, async (req, res, next) => {
  try {
    const { title = '', path: p = '' } = req.body || {};
    if (!PATH_RE.test(p)) throw badRequest('Address must look like /about or /services/web (lowercase, no spaces).');
    const { rows } = await query('INSERT INTO pages (path, title) VALUES ($1, $2) RETURNING id', [p, title]);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return next(badRequest('A page already uses that address.'));
    next(err);
  }
});

adminRouter.get('/api/admin/pages/:id', async (req, res, next) => {
  try {
    const page = await loadPage({ query }, Number(req.params.id));
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) { next(err); }
});

async function savePage(client, id, body, editor) {
  const current = await loadPage(client, id);
  if (!current) throw Object.assign(new Error('Page not found'), { status: 404 });
  const status = body.status === 'published' ? 'published' : 'draft';
  const p = body.path ?? current.path;
  if (!PATH_RE.test(p)) throw badRequest('Address must look like /about or /services/web (lowercase, no spaces).');

  const cleaned = [];
  const errors = [];
  for (const [i, b] of (body.blocks || []).entries()) {
    const out = await cleanBlock(b, `section ${i + 1} (${b.type})`);
    errors.push(...out.errors);
    if (out.block) cleaned.push(out.block);
  }
  // Drafts may be incomplete; only a publish has to pass validation.
  if (status === 'published' && errors.length) throw badRequest('Some sections need fixing before this page can be published.', errors);

  await client.query('INSERT INTO page_revisions (page_id, snapshot, edited_by) VALUES ($1, $2, $3)', [id, current, editor]);
  const seo = { ...(body.seo || {}) };
  if (seo.description) seo.description = String(seo.description).slice(0, 320);
  await client.query('UPDATE pages SET title = $2, path = $3, seo = $4, status = $5, updated_at = now() WHERE id = $1', [id, body.title ?? current.title, p, seo, status]);

  // Upsert by id so block ids survive edits — contact forms post to
  // /api/forms/<blockId>, and an id that changed on every save would break
  // any page a visitor already had open.
  const keep = cleaned.filter((b) => b.id && current.blocks.some((c) => c.id === Number(b.id))).map((b) => Number(b.id));
  await client.query('DELETE FROM blocks WHERE page_id = $1 AND NOT (id = ANY($2::int[]))', [id, keep]);
  for (const [pos, b] of cleaned.entries()) {
    if (b.id && keep.includes(Number(b.id))) {
      await client.query('UPDATE blocks SET position = $2, type = $3, variant = $4, props = $5 WHERE id = $1', [Number(b.id), pos, b.type, b.variant, b.props]);
    } else {
      await client.query('INSERT INTO blocks (page_id, position, type, variant, props) VALUES ($1, $2, $3, $4, $5)', [id, pos, b.type, b.variant, b.props]);
    }
  }
  const saved = await loadPage(client, id);
  saved.warnings = errors;
  return saved;
}

adminRouter.put('/api/admin/pages/:id', json, async (req, res, next) => {
  try {
    res.json(await tx((c) => savePage(c, Number(req.params.id), req.body || {}, req.user.email)));
  } catch (err) {
    if (err.code === '23505') return next(badRequest('A page already uses that address.'));
    next(err);
  }
});

adminRouter.delete('/api/admin/pages/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM pages WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.get('/api/admin/pages/:id/revisions', async (req, res, next) => {
  try {
    res.json((await query('SELECT id, edited_by, created_at FROM page_revisions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 50', [Number(req.params.id)])).rows);
  } catch (err) { next(err); }
});

adminRouter.post('/api/admin/pages/:id/revisions/:rev/restore', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rev = (await query('SELECT snapshot FROM page_revisions WHERE id = $1 AND page_id = $2', [Number(req.params.rev), id])).rows[0];
    if (!rev) return res.status(404).json({ error: 'Revision not found' });
    // Restored as a draft: bringing back an old version shouldn't silently
    // publish it, and the current version is snapshotted first by savePage.
    const snap = { ...rev.snapshot, status: 'draft', blocks: rev.snapshot.blocks.map(({ id: _drop, ...b }) => b) };
    res.json(await tx((c) => savePage(c, id, snap, req.user.email)));
  } catch (err) { next(err); }
});

// ── site settings ────────────────────────────────────────────────────────

adminRouter.get('/api/admin/settings', async (req, res, next) => {
  try { res.json((await query('SELECT data FROM site_settings WHERE id = 1')).rows[0]?.data || {}); } catch (err) { next(err); }
});

adminRouter.put('/api/admin/settings', json, async (req, res, next) => {
  try {
    const data = { ...(req.body || {}) };
    if (data.footer?.text) data.footer.text = sanitizeRich(data.footer.text);
    for (const key of ['nav', 'social']) if (data[key] && !Array.isArray(data[key])) throw badRequest(`${key} must be a list`);
    const { rows } = await query('UPDATE site_settings SET data = $1, updated_at = now() WHERE id = 1 RETURNING data', [data]);
    res.json(rows[0].data);
  } catch (err) { next(err); }
});

// ── media ────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/media', async (req, res, next) => {
  try { res.json((await query('SELECT id, file, url, alt, width, height, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 500')).rows); } catch (err) { next(err); }
});

function slugify(name) {
  return name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'image';
}

// Streams the upload to a temp file (never buffered whole), sniffs the real
// type from its first bytes rather than trusting the browser's claim, then
// hands it to the storage driver.
adminRouter.post('/api/admin/media', (req, res, next) => {
  let bb;
  try { bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: config.media.maxBytes } }); } catch {
    return res.status(400).json({ error: 'Expected a multipart upload.' });
  }
  let handled = false;
  bb.on('file', (_field, stream, info) => {
    handled = true;
    const tmp = path.join(os.tmpdir(), `sp-upload-${crypto.randomBytes(8).toString('hex')}`);
    const out = fs.createWriteStream(tmp);
    let head = Buffer.alloc(0);
    let size = 0;
    let truncated = false;
    stream.on('data', (chunk) => { size += chunk.length; if (head.length < 262144) head = Buffer.concat([head, chunk]).subarray(0, 262144); });
    stream.on('limit', () => { truncated = true; });
    stream.pipe(out);
    out.on('finish', async () => {
      try {
        if (truncated) throw badRequest(`That file is larger than ${config.media.maxBytes / 1048576} MB.`);
        const meta = parseImage(head);
        if (!meta) throw badRequest('Only PNG, JPEG, GIF, WebP and SVG images can be uploaded.');
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[meta.mime];
        const file = `${crypto.randomBytes(4).toString('hex')}-${slugify(info.filename || 'image')}.${ext}`;
        await media().put(tmp, file, meta.mime);
        const { rows } = await query(
          'INSERT INTO media (file, url, width, height, mime, size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, file, url, alt, width, height, mime, size, created_at',
          [file, `/media/${file}`, meta.width, meta.height, meta.mime, size],
        );
        res.status(201).json(rows[0]);
      } catch (err) { next(err); } finally { fsp.rm(tmp, { force: true }).catch(() => {}); }
    });
  });
  bb.on('close', () => { if (!handled) res.status(400).json({ error: 'No file in the upload.' }); });
  bb.on('error', next);
  req.pipe(bb);
});

adminRouter.patch('/api/admin/media/:id', json, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE media SET alt = $2 WHERE id = $1 RETURNING id, alt', [Number(req.params.id), String(req.body?.alt || '').slice(0, 300)]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

adminRouter.delete('/api/admin/media/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM media WHERE id = $1 RETURNING file', [Number(req.params.id)]);
    if (rows[0]) await media().remove(rows[0].file);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── form submissions ─────────────────────────────────────────────────────

adminRouter.get('/api/admin/submissions', async (req, res, next) => {
  try { res.json((await query('SELECT id, page_path, payload, created_at FROM form_submissions ORDER BY created_at DESC LIMIT 500')).rows); } catch (err) { next(err); }
});

// ── users ────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/users', async (req, res, next) => {
  try { res.json((await query('SELECT id, email, role, created_at FROM users ORDER BY created_at')).rows); } catch (err) { next(err); }
});

adminRouter.post('/api/admin/users', requireUser('owner'), json, async (req, res, next) => {
  try {
    const { email, password, role = 'editor' } = req.body || {};
    if (!email || !password || password.length < 10) throw badRequest('Email and a password of 10+ characters are required.');
    if (!['owner', 'editor'].includes(role)) throw badRequest('Role must be owner or editor.');
    const { rows } = await query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role', [email, await hashPassword(password), role]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(badRequest('That email already has an account.'));
    next(err);
  }
});

adminRouter.delete('/api/admin/users/:id', requireUser('owner'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest("You can't remove your own account.");
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
