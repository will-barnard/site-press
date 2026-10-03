import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { extractPage } from './browser/extract.js';
import { squarespaceEnrich } from './adapters/squarespace.js';
import { normaliseUrl, crawlable, pageKey, fetchSitemap } from './urls.js';

// Neutralise what makes two captures of the same page differ: entrance
// animations (Squarespace's preFade/preSlide hide content until scrolled to),
// transitions, carets, and cookie banners covering the content.
export const STABILISE_CSS = `
*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
.preFade, .preScale, .preSlide, .preClip, .preFlex, [data-animation-role], [class*="animation-"], .fadeIn, .reveal { opacity: 1 !important; transform: none !important; clip-path: none !important; }
#onetrust-banner-sdk, .sqs-cookie-banner-v2, .cookie-banner, #cookie-banner, .cc-window, [aria-label*="cookie" i][role="dialog"], .sqs-announcement-bar-dropzone, .sqs-popup-overlay { display: none !important; }
`;

export async function openBrowser() {
  return chromium.launch({ args: ['--disable-dev-shm-usage', '--font-render-hinting=none'] });
}

export async function preparePage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    // Sites with chatty analytics never go network-idle; settle for load.
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  }
  await page.addStyleTag({ content: STABILISE_CSS });
  // Scroll the whole page so lazy images and IntersectionObservers fire.
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// Screenshot each section in document coordinates (clip + fullPage), one PNG
// per section, so scoring never has to crop a 20,000px page in memory.
export async function shootSections(page, sections, dir, vw) {
  await fs.mkdir(dir, { recursive: true });
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const s of sections) {
    const h = Math.min(s.bbox.h, 6000, docH - s.bbox.y);
    if (h < 4) continue;
    await page.screenshot({ path: path.join(dir, `s${s.idx}.png`), clip: { x: 0, y: Math.max(0, s.bbox.y), width: vw, height: h }, fullPage: true, animations: 'disabled' }).catch(() => {});
  }
  await page.screenshot({ path: path.join(dir, 'full.jpg'), fullPage: true, type: 'jpeg', quality: 60, animations: 'disabled' }).catch(() => {});
}

// Open the mobile menu and photograph it: an interactive state static
// screenshots never see, shown side by side in the report (not scored).
export async function shootMobileMenu(page, file, selectors) {
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: file, animations: 'disabled' }).catch(() => {});
      return true;
    }
  }
  return false;
}

export async function capture({ job, dir, log, checkCancel }) {
  const { url: startUrl, options } = job;
  const viewports = [...new Set(options.viewports)].sort((a, b) => b - a); // widest first: it drives extraction
  const primary = viewports[0];
  const origin = new URL(startUrl).origin;
  const home = normaliseUrl(startUrl);

  const queue = [home];
  const sitemap = await fetchSitemap(origin, log);
  for (const u of sitemap) { const n = normaliseUrl(u); if (crawlable(n, origin) && !queue.includes(n)) queue.push(n); }

  const browser = await openBrowser();
  const context = await browser.newContext({ userAgent: config.userAgent, viewport: { width: primary, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pages = [];
  const seen = new Set();
  let platform = 'unknown';
  let enrichment = null;

  try {
    while (queue.length && pages.length < options.maxPages) {
      await checkCancel();
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const t0 = Date.now();
      try {
        await page.setViewportSize({ width: primary, height: 900 });
        await preparePage(page, url);
        const finalUrl = normaliseUrl(page.url());
        // A redirect off-site (or to a page we already have) isn't a page of this site.
        if (!crawlable(finalUrl, origin) && finalUrl !== home) { log.warn(`skipped ${url}: redirected to ${finalUrl}`); continue; }
        if (finalUrl !== url && seen.has(finalUrl)) continue;
        seen.add(finalUrl);

        const data = await page.evaluate(extractPage, {});
        const pathname = new URL(finalUrl).pathname;
        const key = pageKey(pathname);
        const pdir = path.join(dir, key);
        if (data.platform !== 'unknown') platform = data.platform;
        if (platform === 'squarespace') {
          const e = await squarespaceEnrich(page, finalUrl, log);
          if (e) {
            data.squarespace = { ...e, raw: undefined };
            await fs.mkdir(pdir, { recursive: true });
            await fs.writeFile(path.join(pdir, 'format-json.json'), JSON.stringify(e.raw, null, 1));
            if (!enrichment) enrichment = e;
          }
        }
        await shootSections(page, data.sections, path.join(pdir, String(primary)), primary);

        // Other viewports: same DOM, so sections line up by index; only the
        // geometry and screenshots are needed.
        const geometry = { [primary]: data.sections.map((s) => s.bbox) };
        for (const vw of viewports.slice(1)) {
          await page.setViewportSize({ width: vw, height: 900 });
          await page.waitForTimeout(300);
          await page.evaluate(() => window.scrollTo(0, 0));
          const lite = await page.evaluate(extractPage, { lite: true });
          geometry[vw] = lite.sections.map((s) => s.bbox);
          await shootSections(page, lite.sections, path.join(pdir, String(vw)), vw);
        }
        if (pages.length === 0 && viewports.includes(375)) {
          await page.setViewportSize({ width: 375, height: 800 });
          await page.goto(finalUrl, { waitUntil: 'load' }).catch(() => {});
          await page.addStyleTag({ content: STABILISE_CSS });
          await shootMobileMenu(page, path.join(pdir, 'menu-375.png'), ['.header-burger-btn', 'button[aria-label*="menu" i]', '[class*="burger"]', '[class*="hamburger"]', 'button[aria-controls*="nav" i]', '.menu-toggle']);
        }

        await fs.mkdir(pdir, { recursive: true });
        await fs.writeFile(path.join(pdir, 'data.json'), JSON.stringify({ ...data, geometry }, null, 1));
        pages.push({ url: finalUrl, path: pathname, key, title: data.title, sections: data.sections.length });
        log.info(`captured ${pathname} — ${data.sections.length} sections, ${data.images.length} images (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

        for (const l of data.links) {
          const n = normaliseUrl(l);
          if (crawlable(n, origin) && !seen.has(n) && !queue.includes(n)) queue.push(n);
        }
      } catch (err) {
        if (err.cancelled) throw err;
        log.warn(`failed to capture ${url}: ${err.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  if (!pages.length) throw Object.assign(new Error(`Couldn't capture any page from ${startUrl}. Is it reachable from the worker?`), { status: 422 });
  if (queue.length) log.info(`stopped at maxPages=${options.maxPages}; ${queue.length} more URLs were found but not captured`);
  const index = { origin, platform, primary, viewports, pages, uncaptured: queue.slice(0, 200), enrichment: enrichment ? { ...enrichment, raw: undefined } : null };
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
  log.info(`platform: ${platform}; ${pages.length} pages captured`);
  return index;
}
