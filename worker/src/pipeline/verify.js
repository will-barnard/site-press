import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { openBrowser, preparePage, shootSections, shootMobileMenu } from './capture.js';
import { extractPage } from './browser/extract.js';
import { scorePair } from './score.js';
import { coverage } from './text.js';
import { writeSeed } from './generate.js';
import { loadCatalog } from './catalog.js';

// Verify = build the generated site, serve it in preview mode (straight from
// seed.json, no database), capture it exactly the way the original was
// captured, and score every section against its original. No model is
// involved in judging: the numbers decide, and the report shows you why.

function run(cmd, args, { cwd, env, timeoutMs = 240000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${args.join(' ')} timed out`)); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(Object.assign(new Error(`exit ${code}`), { output: out })); });
  });
}

export async function buildSite(outDir, log) {
  const nm = path.join(outDir, 'node_modules');
  await fs.rm(nm, { recursive: true, force: true });
  await fs.symlink(config.templateDeps, nm, 'dir');
  const vite = path.join(nm, 'vite/bin/vite.js');
  const t0 = Date.now();
  await run(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: outDir });
  await run(process.execPath, [vite, 'build', '--ssr', 'core/client/entry-server.js', '--outDir', 'dist/server', '--logLevel', 'warn'], { cwd: outDir });
  log.info(`built the generated site (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

export async function cleanBuild(outDir) {
  await fs.rm(path.join(outDir, 'node_modules'), { recursive: true, force: true });
  await fs.rm(path.join(outDir, 'dist'), { recursive: true, force: true });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

export async function startPreview(outDir, log) {
  const port = await freePort();
  const child = spawn(process.execPath, ['core/server/index.js'], {
    cwd: outDir,
    env: { ...process.env, SITE_PREVIEW_SEED: '1', PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    if (child.exitCode != null) throw new Error(`preview server exited: ${output.slice(-800)}`);
    try { if ((await fetch(`${base}/healthz`)).ok) return { base, stop: () => child.kill('SIGTERM'), output: () => output }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill('SIGKILL');
  throw new Error(`preview server didn't start: ${output.slice(-800)}`);
}

async function captureRebuild({ mapped, base, viewports, dir, keys, log }) {
  const browser = await openBrowser();
  const context = await browser.newContext({ viewport: { width: viewports[0], height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const out = {};
  try {
    for (const p of mapped.pages) {
      if (keys && !keys.has(p.key)) continue;
      const pdir = path.join(dir, p.key);
      out[p.key] = {};
      for (const vw of viewports) {
        await page.setViewportSize({ width: vw, height: 900 });
        await preparePage(page, base + p.path);
        const data = await page.evaluate(extractPage, { lite: true, sectionSelector: '[data-sp-block]' });
        await shootSections(page, data.sections, path.join(pdir, String(vw)), vw);
        out[p.key][vw] = data;
      }
      if (p.path === '/' && viewports.includes(375) && !keys) {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(base + p.path, { waitUntil: 'load' });
        await shootMobileMenu(page, path.join(pdir, 'menu-375.png'), ['.sp-header__toggle']);
      }
      await fs.mkdir(pdir, { recursive: true });
      await fs.writeFile(path.join(pdir, 'data.json'), JSON.stringify(out[p.key], null, 1));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

async function scoreSection({ captureDir, rebuildDir, key, idx, viewports, primary }) {
  const perVp = {};
  for (const vw of viewports) {
    perVp[vw] = await scorePair(path.join(captureDir, key, String(vw), `s${idx}.png`), path.join(rebuildDir, key, String(vw), `s${idx}.png`), {
      diffFile: vw === primary ? path.join(rebuildDir, key, String(vw), `d${idx}.png`) : undefined,
    });
  }
  // The widest viewport carries half the weight: it is what the client
  // compares first, and the one the mapping was decided at.
  const others = viewports.filter((v) => v !== primary);
  const visual = others.length
    ? 0.5 * perVp[primary].visual + 0.5 * (others.reduce((a, v) => a + perVp[v].visual, 0) / others.length)
    : perVp[primary].visual;
  return { perVp, visual: Math.round(visual * 1000) / 1000 };
}

export async function verify({ job, jobDir, index, mapped, pagesData, outDir, seed, log, checkCancel }) {
  const catalog = await loadCatalog();
  const viewports = index.viewports;
  const primary = index.primary;
  const captureDir = path.join(jobDir, 'capture');
  const rebuildDir = path.join(jobDir, 'rebuild');
  const { thresholds } = config;
  await fs.rm(rebuildDir, { recursive: true, force: true });

  const preview = await startPreview(outDir, log);
  const results = {};
  try {
    log.info(`preview running at ${preview.base}; capturing the rebuild`);
    let shots = await captureRebuild({ mapped, base: preview.base, viewports, dir: rebuildDir, log });

    const scorePage = async (p, only) => {
      const orig = pagesData[p.key];
      const rebuilt = shots[p.key]?.[primary];
      const prev = results[p.key]?.sections || [];
      const sections = [];
      for (const [i, block] of p.blocks.entries()) {
        if (only && !only.has(i)) { sections.push(prev[i]); continue; }
        const s = await scoreSection({ captureDir, rebuildDir, key: p.key, idx: i, viewports, primary });
        const text = coverage(orig.sections[i]?.text || '', rebuilt?.sections[i]?.text || '');
        sections.push({
          idx: i, type: block.type, variant: block.variant, source: block._meta?.source, reason: block._meta?.reason,
          visual: s.visual, perVp: s.perVp, text: Math.round(text.score * 1000) / 1000, missing: text.missing.slice(0, 20),
          pass: s.visual >= thresholds.visual && text.score >= thresholds.text,
        });
      }
      const origText = orig.sections.map((s) => s.text).join(' ');
      const newText = (rebuilt?.sections || []).map((s) => s.text).join(' ');
      const pageText = coverage(origText, newText);
      const paths = new Set(mapped.pages.map((x) => x.path));
      const brokenLinks = [...new Set((rebuilt?.links || []).filter((l) => l.startsWith(preview.base)).map((l) => new URL(l).pathname.replace(/\/+$/, '') || '/')
        .filter((pth) => !paths.has(pth) && !pth.startsWith('/media/') && !mapped.redirects.some((r) => r.from === pth)))];
      results[p.key] = {
        path: p.path, sourceUrl: p.sourceUrl, key: p.key, title: p.title, sections,
        text: Math.round(pageText.score * 1000) / 1000, missing: pageText.missing.slice(0, 30),
        brokenLinks, brokenImages: rebuilt?.brokenImages || [],
        sectionCountMatch: (rebuilt?.sections.length ?? 0) === p.blocks.length,
      };
    };
    for (const p of mapped.pages) await scorePage(p);

    // ── fix loop: variant search ──
    // A failing library block often just has the wrong layout variant
    // (image left vs right, centered vs left). Try the alternatives, keep
    // whichever scores best. Deterministic and cheap: the preview server
    // re-reads seed.json, so no rebuild is needed between tries.
    if (job.options.fixLoop) {
      const tried = new Map();
      const best = new Map();
      for (let round = 1; round <= 3; round++) {
        await checkCancel();
        const changed = new Map();
        for (const p of mapped.pages) {
          for (const [i, b] of p.blocks.entries()) {
            const r = results[p.key].sections[i];
            const schema = catalog.blocks[b.type];
            const variants = schema?.variants || [];
            if (r.pass || variants.length < 2) continue;
            const k = `${p.key}#${i}`;
            if (!tried.has(k)) tried.set(k, new Set([b.variant]));
            if (!best.has(k)) best.set(k, { variant: b.variant, visual: r.visual, original: b.variant });
            const next = variants.find((v) => !tried.get(k).has(v));
            if (!next) continue;
            tried.get(k).add(next);
            b.variant = next;
            if (!changed.has(p.key)) changed.set(p.key, new Set());
            changed.get(p.key).add(i);
          }
        }
        if (!changed.size) break;
        log.info(`fix loop round ${round}: trying other layouts for ${[...changed.values()].reduce((a, s) => a + s.size, 0)} section(s)`);
        await writeSeed(outDir, seed, mapped);
        const again = await captureRebuild({ mapped, base: preview.base, viewports, dir: rebuildDir, keys: new Set(changed.keys()), log });
        shots = { ...shots, ...again };
        for (const [key, idxs] of changed) {
          const p = mapped.pages.find((x) => x.key === key);
          await scorePage(p, idxs);
          for (const i of idxs) {
            const k = `${key}#${i}`;
            const r = results[key].sections[i];
            // Switch layouts only for a clear win: on near-ties the mapper's
            // own reading of the page (e.g. centered text) is the better bet.
            if (r.visual > best.get(k).visual + 0.03) best.set(k, { ...best.get(k), variant: p.blocks[i].variant, visual: r.visual });
          }
        }
      }
      // Settle every tried section on its best variant and re-shoot those pages.
      const settle = new Set();
      for (const [k, v] of best) {
        const [key, i] = k.split('#');
        const p = mapped.pages.find((x) => x.key === key);
        if (p.blocks[Number(i)].variant !== v.variant) { p.blocks[Number(i)].variant = v.variant; settle.add(key); }
      }
      const improved = [...best.values()].filter((v) => v.variant !== v.original).length;
      if (settle.size) {
        await writeSeed(outDir, seed, mapped);
        const again = await captureRebuild({ mapped, base: preview.base, viewports, dir: rebuildDir, keys: settle, log });
        shots = { ...shots, ...again };
        for (const key of settle) await scorePage(mapped.pages.find((x) => x.key === key));
      }
      if (best.size) log.info(`fix loop: ${improved} of ${best.size} failing section(s) scored better with another layout`);
    }
  } finally {
    preview.stop();
  }

  const all = Object.values(results).flatMap((r) => r.sections);
  const summary = {
    sections: all.length,
    passed: all.filter((s) => s.pass).length,
    visual: all.length ? Math.round((all.reduce((a, s) => a + s.visual, 0) / all.length) * 1000) / 1000 : 0,
    text: Object.values(results).length ? Math.round((Object.values(results).reduce((a, r) => a + r.text, 0) / Object.values(results).length) * 1000) / 1000 : 0,
    brokenLinks: Object.values(results).reduce((a, r) => a + r.brokenLinks.length, 0),
    thresholds,
  };
  await fs.writeFile(path.join(jobDir, 'scores.json'), JSON.stringify({ summary, pages: results }, null, 1));
  log.info(`verify: ${summary.passed}/${summary.sections} sections pass; mean visual ${summary.visual}, mean text coverage ${summary.text}`);
  return { summary, pages: results };
}
