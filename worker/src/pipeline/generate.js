import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { loadCatalog } from './catalog.js';
import { siteSlug } from './urls.js';
import { squarespaceImageUrl } from './adapters/squarespace.js';

const SITE_PRESS_VERSION = '0.1.0';
const TEMPLATE_SKIP = new Set(['node_modules', 'dist', '.env']);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

function slugify(s) {
  return String(s).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
}

// Every media reference in the mapped content: block props (via each
// block's schema), section background images, and the logo.
function collectMedia(mapped, catalog) {
  const refs = [];
  const push = (v, set) => { if (v?.src) refs.push({ v, set }); };
  if (mapped.site.logo) push(mapped.site.logo, (n) => { mapped.site.logo = n; });
  for (const page of mapped.pages) {
    for (const b of page.blocks) {
      const schema = catalog.blocks[b.type] || b._schema;
      if (schema) catalog.shared.walkMedia(schema.fields, b.props, push);
      const st = b.props._style;
      if (st?.bgImage?.src) push(st.bgImage, (n) => { st.bgImage = n; });
    }
  }
  return refs;
}

async function download(src, dir, imageSize, log) {
  const url = squarespaceImageUrl(src);
  const tmp = path.join(dir, `.dl-${crypto.randomBytes(6).toString('hex')}`);
  try {
    const res = await fetch(url, { headers: { 'user-agent': config.userAgent, accept: 'image/avif,image/webp,image/*,*/*' }, signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 40 * 1024 * 1024) throw new Error('larger than 40 MB');
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const meta = await imageSize.imageSize(tmp);
    if (!meta) throw new Error(`not an image (${res.headers.get('content-type')})`);
    const base = slugify(decodeURIComponent(new URL(src).pathname.split('/').pop() || 'image'));
    const file = `${crypto.createHash('sha1').update(src).digest('hex').slice(0, 8)}-${base}.${EXT[meta.mime] || 'img'}`;
    await fs.rename(tmp, path.join(dir, file));
    const { size } = await fs.stat(path.join(dir, file));
    return { file, mime: meta.mime, width: meta.width, height: meta.height, size };
  } catch (err) {
    await fs.rm(tmp, { force: true });
    log.warn(`image download failed: ${src} — ${err.message}`);
    return null;
  }
}

async function copyTemplate(src, dest) {
  await fs.cp(src, dest, {
    recursive: true,
    filter: (p) => !TEMPLATE_SKIP.has(path.basename(p)),
  });
}

export async function generate({ job, jobDir, index, theme, mapped, log, checkCancel }) {
  const catalog = await loadCatalog();
  const slug = siteSlug(index.origin);
  const outDir = path.join(jobDir, 'out', slug);
  await fs.rm(outDir, { recursive: true, force: true });
  await copyTemplate(config.templateDir, outDir);
  for (const rel of ['package.json', 'docker-compose.yml', 'README.md']) {
    const p = path.join(outDir, rel);
    try { await fs.writeFile(p, (await fs.readFile(p, 'utf8')).replaceAll('__SITE_SLUG__', slug).replaceAll('__SOURCE_URL__', index.origin)); } catch { /* optional file */ }
  }

  // ── media ──
  const mediaDir = path.join(outDir, 'site/seed-media');
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.rm(path.join(mediaDir, '.gitkeep'), { force: true });
  const refs = collectMedia(mapped, catalog);
  const unique = [...new Set(refs.map((r) => r.v.src))].filter((s) => /^https?:/.test(s));
  log.info(`downloading ${unique.length} images`);
  const results = new Map();
  const failed = [];
  for (let i = 0; i < unique.length; i += 4) {
    await checkCancel();
    const batch = unique.slice(i, i + 4);
    const got = await Promise.all(batch.map((src) => download(src, mediaDir, catalog.imageSize, log)));
    batch.forEach((src, j) => { if (got[j]) results.set(src, got[j]); else failed.push(src); });
  }
  const mediaRows = [];
  for (const { v, set } of refs) {
    const got = results.get(v.src);
    // A failed download keeps the original absolute URL so the page still
    // renders, and the report lists it: it hot-links the old CDN, which
    // stops working the day the old site is cancelled.
    if (!got) continue;
    set({ src: `/media/${got.file}`, alt: v.alt || '', width: got.width || v.width, height: got.height || v.height });
    if (!mediaRows.some((m) => m.file === got.file)) mediaRows.push({ file: got.file, alt: v.alt || '', width: got.width, height: got.height, mime: got.mime, size: got.size });
  }

  // ── seed + theme ──
  const seed = {
    version: 1,
    generatedBy: `site-press ${SITE_PRESS_VERSION} from ${index.origin} (job ${job.id})`,
    site: mapped.site,
    media: mediaRows,
    pages: mapped.pages.map((p) => ({
      path: p.path,
      title: p.title,
      status: 'published',
      seo: p.seo,
      blocks: p.blocks.map((b) => ({ type: b.type, variant: b.variant, props: b.props })),
    })),
    redirects: mapped.redirects,
  };
  await fs.writeFile(path.join(outDir, 'site/seed.json'), JSON.stringify(seed, null, 2));
  await fs.writeFile(path.join(outDir, 'site/theme.css'), theme.css);
  await fs.writeFile(path.join(outDir, 'site-press.json'), JSON.stringify({
    sitePress: SITE_PRESS_VERSION,
    coreVersion: catalog.version,
    source: index.origin,
    platform: index.platform,
    jobId: job.id,
    generatedAt: new Date().toISOString(),
    note: 'core/ is vendored from site-press — upgrade it by re-copying, not by editing. Put site-specific changes in site/.',
  }, null, 2));
  log.info(`generated ${slug}: ${seed.pages.length} pages, ${mediaRows.length} images${failed.length ? `, ${failed.length} image downloads failed` : ''}`);
  return { outDir, slug, failedImages: failed, seed };
}

// Rewrite seed.json from the in-memory mapping (after custom blocks or the
// verify loop changed blocks). Media refs were already rewritten in place.
export async function writeSeed(outDir, seed, mapped) {
  seed.pages = mapped.pages.map((p) => ({ path: p.path, title: p.title, status: 'published', seo: p.seo, blocks: p.blocks.map((b) => ({ type: b.type, variant: b.variant, props: b.props })) }));
  await fs.writeFile(path.join(outDir, 'site/seed.json'), JSON.stringify(seed, null, 2));
}
