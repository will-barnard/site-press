import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';
import { startSession, endSession, currentUser, hashPassword, verifyPassword, rateLimit, requireUser } from '../auth.js';

export const authRouter = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60e3, max: 20 });
const userCount = async () => (await query('SELECT count(*)::int AS n FROM users')).rows[0].n;

authRouter.get('/auth/state', async (req, res, next) => {
  try { res.json({ user: await currentUser(req), bootstrapNeeded: (await userCount()) === 0, tokenRequired: Boolean(config.bootstrapToken) }); } catch (err) { next(err); }
});

authRouter.post('/auth/login', limiter, async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const u = (await query('SELECT id, email, is_admin, password_hash FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
    if (!u || !(await verifyPassword(password, u.password_hash))) return res.status(401).json({ error: 'Wrong email or password.' });
    await startSession(res, u.id);
    res.json({ user: { id: u.id, email: u.email, is_admin: u.is_admin } });
  } catch (err) { next(err); }
});

authRouter.post('/auth/logout', async (req, res, next) => {
  try { await endSession(req, res); res.json({ ok: true }); } catch (err) { next(err); }
});

// First account becomes admin; after that, accounts are created by an admin.
authRouter.post('/auth/bootstrap', limiter, async (req, res, next) => {
  try {
    if ((await userCount()) > 0) return res.status(409).json({ error: 'An admin already exists. Sign in instead.' });
    const { email, password, token = '' } = req.body || {};
    if (config.bootstrapToken) {
      const a = Buffer.from(String(token));
      const b = Buffer.from(config.bootstrapToken);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Wrong setup token.' });
    }
    if (!email || !password || password.length < 10) return res.status(422).json({ error: 'Email and a password of 10+ characters are required.' });
    const { rows } = await query('INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, true) RETURNING id, email, is_admin', [email, await hashPassword(password)]);
    await startSession(res, rows[0].id);
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

authRouter.get('/users', requireUser({ admin: true }), async (req, res, next) => {
  try { res.json((await query('SELECT id, email, is_admin, created_at FROM users ORDER BY created_at')).rows); } catch (err) { next(err); }
});
authRouter.post('/users', requireUser({ admin: true }), async (req, res, next) => {
  try {
    const { email, password, is_admin = false } = req.body || {};
    if (!email || !password || password.length < 10) return res.status(422).json({ error: 'Email and a password of 10+ characters are required.' });
    const { rows } = await query('INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin', [email, await hashPassword(password), Boolean(is_admin)]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(422).json({ error: 'That email already has an account.' });
    next(err);
  }
});
authRouter.delete('/users/:id', requireUser({ admin: true }), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(422).json({ error: "You can't remove yourself." });
    await query('DELETE FROM users WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
