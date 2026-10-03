import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';
import { createSession, destroySession, hashPassword, verifyPassword, userFromRequest, rateLimit, requireCsrfHeader } from '../auth.js';

export const authRouter = express.Router();
authRouter.use('/api/auth', express.json({ limit: '32kb' }), requireCsrfHeader);

const limiter = rateLimit({ windowMs: 15 * 60e3, max: 20 });

async function userCount() {
  if (config.preview) return 1;
  return Number((await query('SELECT count(*)::int AS n FROM users')).rows[0].n);
}

authRouter.get('/api/auth/state', async (req, res, next) => {
  try {
    const n = await userCount();
    res.json({ user: await userFromRequest(req), bootstrapNeeded: n === 0, bootstrapEnabled: Boolean(config.bootstrapToken) });
  } catch (err) { next(err); }
});

authRouter.post('/api/auth/login', limiter, async (req, res, next) => {
  try {
    if (config.preview) return res.status(503).json({ error: 'Preview mode has no accounts.' });
    const { email, password } = req.body || {};
    const { rows } = await query('SELECT id, email, role, password_hash FROM users WHERE lower(email) = lower($1)', [email || '']);
    const user = rows[0];
    if (!user || !(await verifyPassword(password || '', user.password_hash))) return res.status(401).json({ error: 'Wrong email or password.' });
    await createSession(res, user.id);
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

authRouter.post('/api/auth/logout', async (req, res, next) => {
  try { await destroySession(req, res); res.json({ ok: true }); } catch (err) { next(err); }
});

// First account. A public site can't use "first visitor becomes owner" —
// someone could claim /admin between deploy and you — so it needs the
// ADMIN_BOOTSTRAP_TOKEN set in the Beachhead dashboard.
authRouter.post('/api/auth/bootstrap', limiter, async (req, res, next) => {
  try {
    if (!config.bootstrapToken) return res.status(403).json({ error: 'Set ADMIN_BOOTSTRAP_TOKEN on the server to create the first account.' });
    if ((await userCount()) > 0) return res.status(409).json({ error: 'An owner already exists. Sign in instead.' });
    const { token, email, password } = req.body || {};
    const a = Buffer.from(String(token || ''));
    const b = Buffer.from(config.bootstrapToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Wrong setup token.' });
    if (!email || !password || password.length < 10) return res.status(422).json({ error: 'Email and a password of 10+ characters are required.' });
    const { rows } = await query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'owner') RETURNING id, email, role", [email, await hashPassword(password)]);
    await createSession(res, rows[0].id);
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});
