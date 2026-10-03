import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { query } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sp_session';
const SESSION_DAYS = 30;

// scrypt from node:crypto rather than a bcrypt dependency: same job, no
// native build step in the Docker image.
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, n, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

// Only a hash of the session id is stored, so a database dump can't be
// replayed as a live login.
function hashId(id) { return crypto.createHash('sha256').update(id).digest('hex'); }

export async function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400e3);
  await query('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashId(id), userId, expires]);
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires, path: '/' });
}

export async function destroySession(req, res) {
  const id = readCookie(req, COOKIE);
  if (id) await query('DELETE FROM sessions WHERE id_hash = $1', [hashId(id)]);
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function userFromRequest(req) {
  if (config.preview) return null;
  if (req._spUser !== undefined) return req._spUser;
  const id = readCookie(req, COOKIE);
  let user = null;
  if (id) {
    const { rows } = await query(
      `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id_hash = $1 AND s.expires_at > now()`,
      [hashId(id)],
    );
    user = rows[0] || null;
  }
  req._spUser = user;
  return user;
}

export function requireUser(role) {
  return async (req, res, next) => {
    try {
      if (config.preview) return res.status(503).json({ error: 'This is a read-only preview; the admin needs a database.' });
      const user = await userFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Sign in first.' });
      if (role === 'owner' && user.role !== 'owner') return res.status(403).json({ error: 'Only an owner can do that.' });
      req.user = user;
      next();
    } catch (err) { next(err); }
  };
}

// CSRF: mutating admin requests must carry a header a cross-site form can't
// send. Paired with SameSite=Lax cookies this closes the usual holes.
export function requireCsrfHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-sp-csrf') !== '1') return res.status(403).json({ error: 'Missing x-sp-csrf header.' });
  next();
}

// A small in-memory limiter. Fine for one container; it resets on restart,
// which is acceptable for slowing down password guessing and form spam.
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const entry = hits.get(k) || { count: 0, reset: now + windowMs };
    if (entry.reset < now) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count += 1;
    hits.set(k, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    next();
  };
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()');
}
