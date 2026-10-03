import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { query, tx } from './db.js';
import { cleanBlock } from './blocks.js';
import { sanitizeRich } from './sanitize.js';
import { media, mimeFor } from './media/index.js';

// Imports site/seed.json (written by site-press) into the database.
//
// Kept separate from code generation on purpose: clients keep editing their
// old site while you build, so you can re-run site-press capture the day
// before launch and import fresh content with `npm run seed -- --replace`
// without regenerating any components.
const SEED = path.join(ROOT, 'site/seed.json');
const SEED_MEDIA = path.join(ROOT, 'site/seed-media');

export async function hasContent() {
  return Number((await query('SELECT count(*)::int AS n FROM pages')).rows[0].n) > 0;
}

export async function importSeed({ replace = false, log = console.log } = {}) {
  let seed;
  try { seed = JSON.parse(await fs.readFile(SEED, 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') { log('[seed] no site/seed.json, nothing to import'); return; }
    throw err;
  }

  // Media first and outside the transaction: uploads to brew-bucket can't be
  // rolled back anyway, and re-running is idempotent (rows upsert by file).
  let mediaCount = 0;
  for (const m of seed.media || []) {
    const src = path.join(SEED_MEDIA, m.file);
    try { await fs.access(src); } catch { log(`[seed] missing media file ${m.file}, skipped`); continue; }
    await media().put(src, m.file, m.mime || mimeFor(m.file));
    await query(
      `INSERT INTO media (file, url, alt, width, height, mime, size) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (file) DO UPDATE SET alt = EXCLUDED.alt`,
      [m.file, `/media/${m.file}`, m.alt || '', m.width || null, m.height || null, m.mime || mimeFor(m.file), m.size || null],
    );
    mediaCount++;
  }

  const warnings = [];
  await tx(async (c) => {
    if (replace) {
      await c.query('DELETE FROM pages');
      await c.query('DELETE FROM redirects');
    }
    const site = { ...(seed.site || {}) };
    if (site.footer?.text) site.footer.text = sanitizeRich(site.footer.text);
    await c.query('UPDATE site_settings SET data = $1, updated_at = now() WHERE id = 1', [site]);

    for (const page of seed.pages || []) {
      const { rows } = await c.query(
        `INSERT INTO pages (path, title, seo, status) VALUES ($1, $2, $3, $4)
         ON CONFLICT (path) DO UPDATE SET title = EXCLUDED.title, seo = EXCLUDED.seo, updated_at = now() RETURNING id`,
        [page.path, page.title || '', page.seo || {}, page.status || 'published'],
      );
      const pageId = rows[0].id;
      await c.query('DELETE FROM blocks WHERE page_id = $1', [pageId]);
      for (const [pos, b] of (page.blocks || []).entries()) {
        const { block, errors } = await cleanBlock(b, `${page.path} #${pos + 1}`);
        warnings.push(...errors);
        if (!block) continue;
        await c.query('INSERT INTO blocks (page_id, position, type, variant, props) VALUES ($1, $2, $3, $4, $5)', [pageId, pos, block.type, block.variant, block.props]);
      }
    }
    for (const r of seed.redirects || []) {
      await c.query('INSERT INTO redirects (from_path, to_path, status) VALUES ($1, $2, $3) ON CONFLICT (from_path) DO UPDATE SET to_path = EXCLUDED.to_path', [r.from, r.to, r.status || 301]);
    }
  });
  log(`[seed] imported ${(seed.pages || []).length} pages, ${mediaCount} images`);
  for (const w of warnings) log(`[seed] warning: ${w}`);
}
