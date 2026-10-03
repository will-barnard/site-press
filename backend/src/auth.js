import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { query } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sitepress_session';

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(got, expected);
}
const hashId = (id) => crypto.createHash('sha256').update(id).digest('hex');

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function startSession(res, userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 30 * 86400e3);
  await query('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashId(id), userId, expires]);
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires, path: '/' });
}
export async function endSession(req, res) {
  const id = readCookie(req);
  if (id) await query('DELETE FROM sessions WHERE id_hash = $1', [hashId(id)]);
  res.clearCookie(COOKIE, { path: '/' });
}
export async function currentUser(req) {
  const id = readCookie(req);
  if (!id) return null;
  const { rows } = await query('SELECT u.id, u.email, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1 AND s.expires_at > now()', [hashId(id)]);
  return rows[0] || null;
}

export function requireUser({ admin = false } = {}) {
  return async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in first.' });
      if (admin && !user.is_admin) return res.status(403).json({ error: 'Admins only.' });
      req.user = user;
      next();
    } catch (err) { next(err); }
  };
}

// Mutations must carry a header a cross-site form can't send.
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('x-sp-csrf') === '1') return next();
  res.status(403).json({ error: 'Missing x-sp-csrf header.' });
}

export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const e = hits.get(req.ip) || { n: 0, reset: now + windowMs };
    if (e.reset < now) { e.n = 0; e.reset = now + windowMs; }
    e.n++;
    hits.set(req.ip, e);
    if (e.n > max) return res.status(429).json({ error: 'Too many attempts; wait a few minutes.' });
    next();
  };
}
