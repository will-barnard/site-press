// URL helpers shared by capture, mapping and generation.

const SKIP_PATH = /^\/(cart|checkout|account|commerce|search|s\/|config|api\/|static\/|universal\/|tag\/|category\/|feed|rss|wp-admin|wp-login|wp-json)/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp3|mp4|mov|docx?|xlsx?|pptx?|ics|xml|json|txt)$/i;

export function normaliseUrl(u, base) {
  let url;
  try { url = new URL(u, base); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href.replace(/\/$/, url.pathname === '/' ? '/' : '');
}

export function sameSite(a, b) {
  const h = (x) => new URL(x).hostname.replace(/^www\./, '');
  try { return h(a) === h(b); } catch { return false; }
}

export function crawlable(u, origin) {
  if (!u || !sameSite(u, origin)) return false;
  const { pathname } = new URL(u);
  return !SKIP_PATH.test(pathname) && !SKIP_EXT.test(pathname);
}

// '/' → 'home', '/about/team' → 'about--team'. Used for directory names.
export function pageKey(pathname) {
  if (pathname === '/' || !pathname) return 'home';
  return pathname.replace(/^\/|\/$/g, '').replace(/\//g, '--').replace(/[^a-zA-Z0-9\-_.]/g, '_').slice(0, 80) || 'page';
}

// The generated site's address rules (see template routes/admin.js PATH_RE).
export function sitePath(pathname) {
  const clean = pathname
    .split('/')
    .map((seg) => decodeURIComponent(seg).toLowerCase().replace(/[^a-z0-9\-_.]+/g, '-').replace(/^[-.]+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return clean ? `/${clean}` : '/';
}

export function siteSlug(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host.split('.')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'site';
}

// Map a captured link onto the rebuilt site: same-site links become paths,
// everything else stays absolute.
export function rewriteHref(href, origin) {
  if (!href) return '';
  if (/^(mailto|tel):/i.test(href)) return href;
  try {
    const u = new URL(href, origin);
    if (sameSite(u.href, origin)) {
      const p = sitePath(u.pathname);
      return p + (u.hash || '');
    }
    return u.href;
  } catch { return href; }
}

export async function fetchSitemap(origin, log) {
  const urls = new Set();
  const seen = new Set();
  async function load(u, depth) {
    if (seen.has(u) || depth > 2) return;
    seen.add(u);
    let xml;
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/xml,text/xml' } });
      if (!res.ok) return;
      xml = await res.text();
    } catch { return; }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(xml)) { for (const l of locs.slice(0, 20)) await load(l, depth + 1); return; }
    for (const l of locs) urls.add(l);
  }
  await load(new URL('/sitemap.xml', origin).href, 0);
  if (urls.size) log?.info(`sitemap.xml lists ${urls.size} URLs`);
  return [...urls];
}
