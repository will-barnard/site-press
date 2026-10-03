import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../config.js';

// Read-only content served straight from site/seed.json (preview mode).
// Re-read when the file changes, so site-press can rewrite the seed between
// verify passes (trying another block variant) without restarting the server.
const SEED = path.join(ROOT, 'site/seed.json');
let cache = { mtime: 0, data: null };

async function load() {
  const st = await fs.stat(SEED);
  if (st.mtimeMs !== cache.mtime) {
    const data = JSON.parse(await fs.readFile(SEED, 'utf8'));
    // Give every block a stable id the way the database would, so
    // data-sp-block attributes line up between runs.
    let n = 1;
    for (const page of data.pages || []) for (const b of page.blocks || []) b.id = b.id ?? n++;
    cache = { mtime: st.mtimeMs, data };
  }
  return cache.data;
}

export async function getSite() { return (await load()).site || {}; }

export async function getPage(p) {
  const page = ((await load()).pages || []).find((x) => x.path === p);
  return page ? { id: page.path, path: page.path, title: page.title, seo: page.seo || {}, status: 'published', blocks: page.blocks || [] } : null;
}

export async function listPublished() {
  return ((await load()).pages || []).map((p) => ({ path: p.path, updated_at: new Date() }));
}

export async function getRedirect(p) {
  const r = ((await load()).redirects || []).find((x) => x.from === p);
  return r ? { to_path: r.to, status: r.status || 301 } : null;
}

export async function getFormBlock() { return null; }
