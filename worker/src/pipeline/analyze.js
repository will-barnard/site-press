// Design tokens from captured computed styles. Output: theme.json (the
// numbers, for the report) and theme.css (custom properties the template's
// base.css and blocks read).

const px = (v) => (v == null || v === '' || Number.isNaN(parseFloat(v)) ? null : parseFloat(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function parseColor(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}
export function toHex(c) {
  const p = typeof c === 'string' ? parseColor(c) : c;
  if (!p || p.a === 0) return null;
  const h = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(p.r)}${h(p.g)}${h(p.b)}`;
}
export function luminance(c) {
  const p = parseColor(c);
  if (!p) return 1;
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(p.r) + 0.7152 * ch(p.g) + 0.0722 * ch(p.b);
}

// "Proxima Nova", proxima-nova, sans-serif → first family + a sane fallback stack.
function fontStack(family, kind) {
  if (!family) return null;
  const first = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const generic = /serif/i.test(family) && !/sans-serif/i.test(family) ? 'Georgia, serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  if (/^(system-ui|-apple-system|sans-serif|serif|Arial|Helvetica)$/i.test(first)) return family;
  return `"${first}", ${kind === 'mono' ? 'monospace' : generic}`;
}
const firstFamily = (f) => (f || '').split(',')[0].trim().replace(/^["']|["']$/g, '');

function fluid(sizePx, viewport, minRatio = 0.62) {
  if (!sizePx) return null;
  const max = Math.round(sizePx);
  const min = Math.round(Math.max(16, sizePx * minRatio));
  if (max - min < 4) return `${max}px`;
  const vw = ((sizePx / viewport) * 100).toFixed(2);
  return `clamp(${min}px, ${vw}vw, ${max}px)`;
}

const median = (arr) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

export function analyze({ index, pages }) {
  const home = pages[0].data;
  const st = home.styles;
  const vw = st.viewport || index.primary;
  const decisions = [];

  // Fonts: Google Fonts links can be reused as-is; Adobe Fonts (what
  // Squarespace bundles) are licensed to the old site and won't load on a
  // new domain, so they need a call from you or the client.
  const googleLink = home.fontLinks.find((l) => /fonts\.googleapis\.com|fonts\.bunny\.net/.test(l)) || null;
  const adobe = home.fontLinks.some((l) => /typekit\.net/.test(l)) || index.platform === 'squarespace';
  const families = [...new Set([st.body?.fontFamily, st.h1?.fontFamily, st.h2?.fontFamily, st.button?.fontFamily].filter(Boolean).map(firstFamily))];
  const googleFamilies = googleLink ? decodeURIComponent(googleLink).match(/family=([^&:]+)/g)?.map((f) => f.slice(7).replace(/\+/g, ' ')) || [] : [];
  for (const fam of families) {
    if (googleFamilies.some((g) => g.toLowerCase() === fam.toLowerCase())) continue;
    if (/^(system-ui|-apple-system|arial|helvetica|georgia|times|verdana|sans-serif|serif)/i.test(fam)) continue;
    decisions.push({
      kind: 'font',
      title: `Font "${fam}" may not be licensed for the new site`,
      detail: adobe
        ? `Loaded through Adobe Fonts / Squarespace on the original. Either the client gets an Adobe Fonts kit for the new domain, or swap to a Google Font in site/theme.css.`
        : `No freely-usable source found. Check the licence, or swap it in site/theme.css.`,
    });
  }

  const bodyBg = st.body?.backgroundColor || 'rgb(255,255,255)';
  const text = st.p?.color || st.body?.color || 'rgb(31,31,31)';
  const link = st.link?.color || text;
  const btn = st.button;
  const header = home.header;
  const footer = home.footer;

  const sectionPads = pages.flatMap((p) => p.data.sections.map((s) => s.padTop)).filter((v) => v != null && v > 8 && v < 300);
  const sectionPad = clamp(Math.round(median(sectionPads) ?? 80), 24, 200);
  // Content width = the widest text column seen across sections (90th
  // percentile, so one full-bleed outlier doesn't set it) plus gutters.
  const gutter = clamp(st.gutter || 24, 12, 120);
  const gutterToken = gutter > 60 ? 48 : Math.max(16, gutter);
  const spans = pages.flatMap((p) => p.data.sections.map((s) => (s.textRight ?? 0) - (s.textLeft ?? 0))).filter((w) => w > 200).sort((a, b) => a - b);
  const textSpan = spans.length ? spans[Math.floor(spans.length * 0.9)] : vw - 2 * gutter;
  const contentWidth = clamp(Math.round(textSpan + 2 * gutterToken), 720, 1800);

  const bodySize = clamp(px(st.p?.fontSize) || 17, 13, 24);
  const lh = px(st.p?.lineHeight);
  const tokens = {
    '--sp-font-body': fontStack(st.p?.fontFamily || st.body?.fontFamily),
    '--sp-font-heading': fontStack(st.h1?.fontFamily || st.h2?.fontFamily || st.body?.fontFamily),
    '--sp-body-size': `${bodySize}px`,
    '--sp-body-line-height': lh ? (lh / bodySize).toFixed(2) : '1.6',
    '--sp-heading-weight': st.h2?.fontWeight || st.h1?.fontWeight || '600',
    '--sp-heading-line-height': px(st.h2?.lineHeight) && px(st.h2?.fontSize) ? (px(st.h2.lineHeight) / px(st.h2.fontSize)).toFixed(2) : '1.2',
    '--sp-heading-letter-spacing': st.h1?.letterSpacing && st.h1.letterSpacing !== 'normal' ? st.h1.letterSpacing : 'normal',
    '--sp-h1-size': fluid(px(st.h1?.fontSize) || 48, vw) || 'clamp(2.2rem, 5vw, 3.6rem)',
    '--sp-h2-size': fluid(px(st.h2?.fontSize) || 34, vw, 0.7) || 'clamp(1.7rem, 3.5vw, 2.4rem)',
    '--sp-h3-size': `${Math.round(px(st.h3?.fontSize) || 22)}px`,
    '--sp-h3-weight': st.h3?.fontWeight || st.h2?.fontWeight || '600',
    '--sp-h3-font': fontStack(st.h3?.fontFamily) || 'var(--sp-font-heading)',
    '--sp-color-text': toHex(text) || '#1f1f1f',
    '--sp-color-bg': toHex(bodyBg) || '#ffffff',
    '--sp-color-link': toHex(link) || '#1f4fd1',
    '--sp-content-width': `${contentWidth}px`,
    '--sp-gutter': `${gutterToken}px`,
    '--sp-gap': `${clamp(Math.round(gutter * 0.8), 20, 48)}px`,
    '--sp-section-pad': `${sectionPad}px`,
    '--sp-radius': btn?.borderRadius && px(btn.borderRadius) <= 12 ? btn.borderRadius : '4px',
    '--sp-btn-bg': toHex(btn?.backgroundColor) || toHex(text) || '#1f1f1f',
    '--sp-btn-color': toHex(btn?.color) || '#ffffff',
    '--sp-btn-radius': btn?.borderRadius || '4px',
    '--sp-btn-pad': btn ? `${px(btn.paddingTop) || 12}px ${px(btn.paddingLeft) || 24}px` : '0.8em 1.6em',
    '--sp-btn-font': fontStack(btn?.fontFamily) || 'inherit',
    '--sp-btn-weight': btn?.fontWeight || '600',
    '--sp-btn-transform': btn?.textTransform || 'none',
    '--sp-btn-letter-spacing': btn?.letterSpacing || 'normal',
    '--sp-header-bg': toHex(header?.bg) || toHex(bodyBg) || '#ffffff',
    '--sp-header-color': toHex(header?.color) || toHex(text) || '#1f1f1f',
    '--sp-header-height': `${clamp(header?.bbox?.h || 84, 48, 200)}px`,
    '--sp-header-position': header?.position || 'relative',
    '--sp-logo-height': header?.logo?.h ? `${clamp(header.logo.h, 16, 160)}px` : 'auto',
    '--sp-nav-size': header?.navSize ? `${header.navSize}px` : '1rem',
    '--sp-footer-bg': toHex(footer?.bg) || '#f3f3f3',
    '--sp-footer-color': toHex(footer?.color) || toHex(text) || '#1f1f1f',
  };
  // A dark section with a light hero overlay: text on an image is light.
  tokens['--sp-hero-on-image'] = '#ffffff';

  const css = [
    '/* Theme captured by site-press from the original site. Edit freely —',
    '   site-press only writes this file when it generates the site. */',
    ':root {',
    ...Object.entries(tokens).filter(([, v]) => v != null).map(([k, v]) => `  ${k}: ${v};`),
    '}',
    '',
  ].join('\n');

  return {
    tokens,
    css,
    fontsHref: googleLink,
    families,
    palette: home.palette.map(([c, w]) => ({ color: toHex(c), weight: Math.round(w) })).filter((p) => p.color),
    decisions,
  };
}
