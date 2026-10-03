import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { query } from '../db.js';
import { DryDock } from '../lib/drydock.js';
import { capture } from './capture.js';
import { analyze } from './analyze.js';
import { mapSite } from './map.js';
import { generate, writeSeed } from './generate.js';
import { generateCustomBlocks, revertCustomBlocks } from './custom-blocks.js';
import { buildSite, cleanBuild, verify } from './verify.js';
import { buildReport } from './report.js';
import { packageJob } from './package.js';

export class Cancelled extends Error { constructor() { super('cancelled'); this.cancelled = true; } }

const STAGES = ['capture', 'analyze', 'map', 'generate', 'custom', 'verify', 'report', 'package'];

export async function runJob(job, log) {
  const jobDir = path.join(config.jobsDir, job.id);
  await fs.mkdir(jobDir, { recursive: true });
  const options = job.options;

  const stage = async (name) => {
    log.setStage(name);
    await query('UPDATE jobs SET stage = $2, progress = $3 WHERE id = $1', [job.id, name, STAGES.indexOf(name) / STAGES.length]);
  };
  const checkCancel = async () => {
    const { rows } = await query('SELECT cancel_requested FROM jobs WHERE id = $1', [job.id]);
    if (rows[0]?.cancel_requested) throw new Cancelled();
  };

  const drydock = new DryDock({ ...config.drydock, log });
  if (options.ai !== 'off' || options.customBlocks) {
    const h = await drydock.health();
    if (!h.ok) { log.warn(`dry-dock unavailable (${h.reason}); mapping with rules only`); drydock.down = true; }
    else log.info(`dry-dock reachable; using pool "${config.drydock.pool || 'auto'}"${config.drydock.model ? ` model ${config.drydock.model}` : ''}`);
  } else drydock.down = true;

  // 1. capture
  await stage('capture');
  const index = await capture({ job: { ...job, options }, dir: path.join(jobDir, 'capture'), log, checkCancel });
  const pages = [];
  for (const p of index.pages) pages.push({ ...p, data: JSON.parse(await fs.readFile(path.join(jobDir, 'capture', p.key, 'data.json'), 'utf8')) });
  const pagesData = Object.fromEntries(pages.map((p) => [p.key, p.data]));

  // 2. analyze
  await stage('analyze');
  const theme = analyze({ index, pages });
  await fs.mkdir(path.join(jobDir, 'analysis'), { recursive: true });
  await fs.writeFile(path.join(jobDir, 'analysis/theme.json'), JSON.stringify(theme, null, 1));
  log.info(`theme: ${theme.families.join(', ') || 'system fonts'}; ${theme.palette.length} colours`);

  // 3. map
  await stage('map');
  const mapped = await mapSite({ index, pages, theme, options, drydock, log, checkCancel });

  // 4. generate
  await stage('generate');
  const gen = await generate({ job, jobDir, index, theme, mapped, log, checkCancel });

  // 5. custom blocks (dry-dock coder) for whatever is still a placeholder
  await stage('custom');
  let custom = [];
  if (options.customBlocks && drydock.enabled) {
    custom = await generateCustomBlocks({ mapped, pagesData, outDir: gen.outDir, drydock, log, checkCancel, limit: options.maxCustomBlocks });
    // Custom block images still point at the old site; run them through the
    // same download path by regenerating media for just those blocks.
    if (custom.length) {
      const { localiseMedia } = await import('./media-fixup.js');
      await localiseMedia({ mapped, outDir: gen.outDir, seed: gen.seed, custom, log });
      await writeSeed(gen.outDir, gen.seed, mapped);
    }
  } else if (options.customBlocks) {
    log.info('custom blocks skipped: dry-dock unavailable');
  }

  // 6. build + verify
  await stage('verify');
  let scores;
  try {
    try {
      await buildSite(gen.outDir, log);
    } catch (err) {
      if (!custom.length) throw Object.assign(new Error(`the generated site failed to build: ${(err.output || err.message).slice(-1500)}`), { status: 500 });
      // A generated block passed our compile check but broke the full build:
      // fall back to placeholders rather than failing the whole job.
      log.warn(`build failed with custom blocks; reverting them. ${(err.output || '').slice(-600)}`);
      await revertCustomBlocks({ mapped, outDir: gen.outDir, made: custom, log });
      custom = [];
      await writeSeed(gen.outDir, gen.seed, mapped);
      await buildSite(gen.outDir, log);
    }
    scores = await verify({ job: { ...job, options }, jobDir, index, mapped, pagesData, outDir: gen.outDir, seed: gen.seed, log, checkCancel });
  } finally {
    await cleanBuild(gen.outDir);
  }

  // 7. report
  await stage('report');
  const decisions = [...theme.decisions];
  const allBlocks = mapped.pages.flatMap((p) => p.blocks.map((b) => ({ ...b, page: p.path })));
  const placeholders = allBlocks.filter((b) => b.type === 'placeholder');
  if (placeholders.length) decisions.push({ kind: 'placeholder', title: `${placeholders.length} section(s) kept as "Imported content" placeholders`, detail: `All their text and images are kept, in a plain layout. Pages: ${[...new Set(placeholders.map((b) => b.page))].join(', ')}. Build a block for them or keep them as they are.` });
  if (gen.failedImages.length) decisions.push({ kind: 'images', title: `${gen.failedImages.length} image(s) couldn't be downloaded and still load from the old site`, detail: `They break when the old site is cancelled. First few: ${gen.failedImages.slice(0, 4).join(', ')}` });
  if (allBlocks.some((b) => b.type === 'contact-form')) decisions.push({ kind: 'forms', title: 'Contact forms save to the admin, but don\'t email anyone yet', detail: 'Submissions appear under Form submissions in /admin. Email notification is not built.' });
  if (index.uncaptured.length) decisions.push({ kind: 'pages', title: `${index.uncaptured.length} more page(s) were found but not rebuilt (maxPages = ${options.maxPages})`, detail: `They will 404 on the new site unless you raise maxPages or add redirects. First few: ${index.uncaptured.slice(0, 5).join(', ')}` });
  if (mapped.pages.some((p) => /\/(blog|news|journal|events|posts?)(\/|$)/.test(p.path))) decisions.push({ kind: 'collections', title: 'Blog or event pages were imported as ordinary pages', detail: 'Collections (posts with list/detail pages, RSS) aren\'t built yet, so each post is its own page. New posts will have to be added as pages until collections land.' });
  if (mapped.redirects.length) decisions.push({ kind: 'redirects', title: `${mapped.redirects.length} page address(es) changed`, detail: 'Old addresses 301 to the new ones (site/seed.json → redirects).' });
  if (scores.summary.brokenLinks) decisions.push({ kind: 'links', title: `${scores.summary.brokenLinks} internal link(s) point to pages that weren't rebuilt`, detail: 'Listed per page below.' });
  if ((options.ai !== 'off' || options.customBlocks) && !drydock.stats.calls) decisions.push({ kind: 'drydock', title: 'dry-dock wasn\'t used', detail: 'It was unreachable or not configured, so every section was mapped by rules. Check DRYDOCK_BASE_URL / DRYDOCK_API_KEY and that the MacBook (coder pool) is awake, then retry the job.' });
  await buildReport({ job, jobDir, index, theme, mapped, scores, gen, custom, drydockStats: drydock.stats, decisions });
  await fs.writeFile(path.join(jobDir, 'mapping.json'), JSON.stringify(mapped.pages.map((p) => ({ path: p.path, blocks: p.blocks.map((b) => ({ type: b.type, variant: b.variant, meta: b._meta })) })), null, 1));

  // 8. package
  await stage('package');
  const artifacts = await packageJob({ job, jobDir, slug: gen.slug, log });

  const counts = { rule: 0, ai: 0, custom: 0, placeholder: 0 };
  for (const b of allBlocks) counts[b.type === 'placeholder' ? 'placeholder' : (b._meta?.source || 'rule')]++;
  return {
    slug: gen.slug,
    platform: index.platform,
    pages: mapped.pages.length,
    scores: scores.summary,
    counts,
    customBlocks: custom.map((c) => c.name),
    decisions,
    drydock: drydock.stats,
    artifacts,
  };
}
