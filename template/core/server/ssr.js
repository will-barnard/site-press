import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { content } from './content/index.js';
import { userFromRequest } from './auth.js';
import { normalisePath } from './routes/public.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// State goes into a <script>; escaping "<" stops a page title containing
// "</script>" from ending the tag early.
const LS = new RegExp(String.fromCharCode(0x2028, 124, 0x2029), 'g'); // U+2028|U+2029: valid JSON, invalid in old JS parsers
const serialise = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

function firstImage(page) {
  for (const b of page?.blocks || []) {
    const p = b.props || {};
    const img = p.image || p.images?.[0]?.image || p.cards?.[0]?.image || p._style?.bgImage;
    if (img?.src) return img.src;
  }
  return null;
}

function headFor(site, page, url) {
  const siteTitle = site.siteTitle || '';
  const title = page ? (page.seo?.title || [page.title, siteTitle].filter(Boolean).join(' — ')) : `Page not found — ${siteTitle}`;
  const description = page?.seo?.description || site.seoDescription || '';
  const base = config.publicUrl;
  const image = page?.seo?.ogImage || firstImage(page);
  const tags = [`<title>${esc(title)}</title>`];
  if (description) tags.push(`<meta name="description" content="${esc(description)}">`);
  tags.push(`<meta property="og:title" content="${esc(title)}">`, '<meta property="og:type" content="website">');
  if (description) tags.push(`<meta property="og:description" content="${esc(description)}">`);
  if (image) tags.push(`<meta property="og:image" content="${esc(image.startsWith('http') ? image : `${base}${image}`)}">`);
  if (base && page) tags.push(`<link rel="canonical" href="${esc(base + (url === '/' ? '/' : url))}">`);
  if (config.preview) tags.push('<meta name="robots" content="noindex">');
  if (site.fontsHref) tags.push(`<link rel="stylesheet" href="${esc(site.fontsHref)}">`);
  return tags.join('\n    ');
}

export async function createRenderer() {
  let template;
  let render;
  try {
    template = await fs.readFile(path.join(config.distDir, 'client/index.html'), 'utf8');
    ({ render } = await import(pathToFileURL(path.join(config.distDir, 'server/entry-server.js')).href));
  } catch (err) {
    if (config.production) throw err;
    // Dev with no build yet: the API still works for `npm run dev` (vite
    // serves the client and proxies /api here).
    console.warn('[ssr] no build in dist/ — page requests will 503 until `npm run build`');
    return (req, res) => res.status(503).type('text/plain').send('Not built yet: run `npm run build`, or use `npm run dev` for the client.');
  }

  return async function ssr(req, res, next) {
    try {
      // The admin is a client-only app: hand back the bare shell.
      if (req.path.startsWith('/admin')) {
        return res.type('html').send(template.replace('<!--ssr-head-->', '<title>Admin</title><meta name="robots" content="noindex">').replace('<!--ssr-outlet-->', '').replace('<!--ssr-state-->', ''));
      }
      const url = normalisePath(req.path);
      if (req.path !== '/' && req.path.endsWith('/')) return res.redirect(301, url + (req.url.slice(req.path.length) || ''));

      const redirect = await content.getRedirect(url);
      if (redirect) return res.redirect(redirect.status || 301, redirect.to_path);

      const includeDrafts = req.query.preview === '1' && Boolean(await userFromRequest(req));
      const [site, page] = await Promise.all([content.getSite(), content.getPage(url, { includeDrafts })]);
      const { html, state } = await render(url, { site, page, path: url, notFound: !page });
      const out = template
        .replace('<!--ssr-head-->', headFor(site, page, url))
        .replace('<!--ssr-outlet-->', html)
        .replace('<!--ssr-state-->', `<script>window.__SP_STATE__=${serialise(state)}</script>`);
      res.status(page ? 200 : 404).type('html').set('cache-control', includeDrafts ? 'no-store' : 'public, max-age=60').send(out);
    } catch (err) { next(err); }
  };
}
