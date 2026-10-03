// Squarespace adapter. Squarespace serves a JSON view of most pages at
// ?format=json; it carries site-level data the rendered page hides (site
// title, social accounts, SEO description).
//
// Best effort: the field names below come from working knowledge, not a
// published contract. Everything is optional; the rendered DOM stays the
// source of truth, and this only fills gaps.
export async function squarespaceEnrich(page, url, log) {
  let data = null;
  try {
    const u = new URL(url);
    u.searchParams.set('format', 'json');
    const res = await page.request.get(u.href, { timeout: 15000 });
    if (res.ok()) data = await res.json().catch(() => null);
  } catch (err) {
    log?.warn(`?format=json failed for ${url}: ${err.message}`);
  }
  if (!data) return null;
  const site = data.website || {};
  const coll = data.collection || {};
  return {
    raw: data,
    siteTitle: site.siteTitle || null,
    siteDescription: stripHtml(site.siteDescription || ''),
    seoDescription: coll.seoData?.seoDescription || stripHtml(coll.description || '') || null,
    social: (site.socialAccounts || []).map((a) => ({ label: a.serviceName || a.screenname || 'Social', href: a.profileUrl })).filter((s) => s.href),
    collectionType: coll.typeName || coll.type || null,
  };
}

// Squarespace's CDN serves a size per ?format=Nw; the largest standard step
// is 2500w. The bare URL also works but is often a smaller default.
export function squarespaceImageUrl(src) {
  try {
    const u = new URL(src);
    if (/squarespace-cdn\.com|static1\.squarespace\.com/.test(u.hostname)) {
      u.search = '';
      u.searchParams.set('format', '2500w');
      return u.href;
    }
  } catch { /* not a URL */ }
  return src;
}

function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
