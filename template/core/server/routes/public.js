import express from 'express';
import { config } from '../config.js';
import { content } from '../content/index.js';
import { userFromRequest } from '../auth.js';
import { media } from '../media/index.js';

export const publicRouter = express.Router();

export function normalisePath(p) {
  let s = decodeURIComponent(String(p || '/')).split('?')[0].replace(/\/+$/, '');
  if (!s.startsWith('/')) s = `/${s}`;
  return s === '' ? '/' : s;
}

publicRouter.get('/api/site', async (req, res, next) => {
  try { res.json(await content.getSite()); } catch (err) { next(err); }
});

publicRouter.get('/api/page', async (req, res, next) => {
  try {
    const path = normalisePath(req.query.path);
    const includeDrafts = req.query.preview === '1' && Boolean(await userFromRequest(req));
    const page = await content.getPage(path, { includeDrafts });
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json({ page, site: await content.getSite() });
  } catch (err) { next(err); }
});

publicRouter.get('/media/:file', async (req, res, next) => {
  try {
    if (!(await media().serve(res, req.params.file))) res.status(404).end();
  } catch (err) { next(err); }
});

publicRouter.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const pages = await content.listPublished();
    const urls = pages.map((p) => `  <url><loc>${base}${p.path === '/' ? '/' : p.path}</loc><lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod></url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  } catch (err) { next(err); }
});

publicRouter.get('/robots.txt', (req, res) => {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  // Preview builds must never be indexed alongside the real site.
  res.type('text/plain').send(config.preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`);
});
