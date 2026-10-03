import crypto from 'node:crypto';
import { loadCatalog } from './catalog.js';
import { coverage } from './text.js';
import { toHex } from './analyze.js';
import { rewriteHref, sitePath, sameSite } from './urls.js';

// Section → block. Deterministic rules first: they're instant, explainable,
// and right for most Squarespace sections. A rule's result is then checked
// against the section's own text — if the props it built dropped words, its
// confidence drops — and low-confidence sections go to dry-dock (ai: 'auto'),
// or every section does (ai: 'all'). Whatever dry-dock returns is validated
// against the same schema and the same text check before it's accepted.

const SOCIAL = /instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|bandcamp\.com|spotify\.com|soundcloud\.com|vimeo\.com|threads\.net|bsky\.app/i;
const EMBED_HOSTS = /youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|google\.com\/maps|maps\.google|open\.spotify\.com|soundcloud\.com|bandcamp\.com/i;

function hashOf(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

export function makeMapper({ origin, theme, catalog }) {
  const { blocks, shared } = catalog;
  const pageBg = theme.tokens['--sp-color-bg'];
  const sectionPad = parseInt(theme.tokens['--sp-section-pad'], 10);

  const link = (label, href) => ({ label: label || '', href: rewriteHref(href, origin) });
  const fixLinks = (html) => String(html || '').replace(/href="([^"]*)"/g, (_, h) => `href="${rewriteHref(h.replace(/&quot;/g, '"'), origin)}"`);

  function flowToHtml(flow, { skipFirstHeading = false, skipKinds = ['button', 'form'] } = {}) {
    let skipped = !skipFirstHeading;
    const out = [];
    for (const f of flow) {
      if (skipKinds.includes(f.kind)) continue;
      if (f.kind === 'h') {
        if (!skipped) { skipped = true; continue; }
        out.push(f.level <= 2 ? `<h2>${f.html}</h2>` : `<h3>${f.html}</h3>`);
      } else if (f.kind === 'p') out.push(`<p>${fixLinks(f.html)}</p>`);
      else if (f.kind === 'list') out.push(`<${f.ordered ? 'ol' : 'ul'}>${f.items.map((i) => `<li>${fixLinks(i)}</li>`).join('')}</${f.ordered ? 'ol' : 'ul'}>`);
      else if (f.kind === 'quote') out.push(`<blockquote>${f.text}</blockquote>`);
    }
    return out.join('');
  }

  function styleFor(section, type) {
    const st = {};
    const bg = toHex(section.bg);
    if (bg && bg !== pageBg) st.bg = bg;
    if ((st.bg || section.bgImage) && section.color) st.color = toHex(section.color);
    if (section.bgImage && type !== 'hero') st.bgImage = section.__media(section.bgImage);
    if (section.overlay != null) st.overlay = Math.round(section.overlay * 100) / 100;
    if (section.padTop != null && Math.abs(section.padTop - sectionPad) > 40) st.padY = Math.max(0, Math.min(400, section.padTop));
    if (section.centered && !['hero', 'cta', 'quote'].includes(type)) st.align = 'center';
    return st;
  }

  // ── rules ──────────────────────────────────────────────────────────────
  function rules(section, ctx) {
    const { flow, images, buttons, iframes, forms, quotes, repeats } = section;
    const headings = flow.filter((f) => f.kind === 'h');
    const paras = flow.filter((f) => f.kind === 'p');
    const textLen = section.text.length;
    const firstHeading = headings[0];
    const m = section.__media;
    const btns = buttons.slice(0, 2).map((b) => ({ link: link(b.label, b.href) }));

    if (forms.length) {
      const f = forms[0];
      const seenNames = new Set();
      return {
        type: 'contact-form', confidence: 0.9, reason: 'contains a form',
        props: {
          heading: firstHeading?.text || '',
          intro: flowToHtml(flow.filter((x) => x.kind !== 'form'), { skipFirstHeading: Boolean(firstHeading) }),
          fields: f.fields.map((x) => {
            let name = x.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'field';
            while (seenNames.has(name)) name += '_2';
            seenNames.add(name);
            return { label: x.label, name, type: x.type, required: Boolean(x.required) };
          }),
          submitLabel: f.submit || 'Send',
        },
      };
    }

    const embed = iframes.find((s) => EMBED_HOSTS.test(s));
    if (embed && textLen < 400) {
      return { type: 'embed', confidence: 0.85, reason: 'an embedded video or map', props: { heading: firstHeading?.text || '', src: embed, title: firstHeading?.text || '', aspect: /maps/.test(embed) ? '3:1' : '16:9' } };
    }

    const bigImage = images.find((i) => i.w > section.bbox.w * 0.4 && i.h > 220);
    if (ctx.first && firstHeading && (section.bgImage || bigImage) && textLen < 600) {
      let variant = section.centered ? 'centered' : 'left';
      let image = section.bgImage ? m(section.bgImage) : null;
      if (!section.bgImage && bigImage) {
        image = m(bigImage.id);
        variant = bigImage.x < (section.textLeft ?? 0) - section.bbox.x ? 'split-left' : 'split-right';
      }
      const sub = paras.map((p) => p.text).join(' ');
      return { type: 'hero', variant, confidence: 0.8, reason: 'first section with a heading over/beside a large image', props: { heading: firstHeading.text, subheading: sub, image, buttons: btns } };
    }

    if (quotes.length && quotes.join(' ').length > textLen * 0.5) {
      const attribution = paras.map((p) => p.text).find((t) => t.length < 80 && !quotes.includes(t)) || '';
      return { type: 'quote', variant: quotes[0].length > 160 ? 'default' : 'large', confidence: 0.75, reason: 'mostly a quotation', props: { quote: quotes[0].replace(/^["“]|["”]$/g, ''), attribution: attribution.replace(/^[—–-]\s*/, ''), image: images[0] ? m(images[0].id) : null } };
    }

    if (repeats && repeats.items.length >= 2) {
      const imageOnly = repeats.items.every((it) => it.imgId && !it.title && it.text.length < 60);
      if (imageOnly) {
        return { type: 'gallery', variant: 'grid', confidence: 0.8, reason: `${repeats.items.length} repeated images`, props: { heading: firstHeading?.text || '', columns: Math.min(6, repeats.columns || 3), images: repeats.items.map((it) => ({ image: m(it.imgId), caption: it.text })) } };
      }
      const titles = new Set(repeats.items.map((i) => i.title));
      const intro = flow.filter((f) => f.kind === 'p' && !repeats.items.some((it) => it.text.includes(f.text)));
      return {
        type: 'card-grid', variant: 'default',
        // Text-only rows (stats, "number + label") fit cards loosely; let dry-dock weigh in.
        confidence: repeats.textOnly ? 0.55 : 0.7,
        reason: `${repeats.items.length} repeated ${repeats.textOnly ? 'text ' : ''}items, ${repeats.columns} per row`,
        props: {
          heading: firstHeading && !titles.has(firstHeading.text) ? firstHeading.text : '',
          intro: intro.map((p) => `<p>${fixLinks(p.html)}</p>`).join(''),
          columns: Math.min(6, Math.max(1, repeats.columns || 3)),
          cards: repeats.items.map((it) => ({ image: it.imgId ? m(it.imgId) : null, title: it.title, body: fixLinks(it.body), link: it.link ? link(it.link.label, it.link.href) : { label: '', href: '' } })),
        },
      };
    }

    if (images.length >= 3 && textLen < 250) {
      return { type: 'gallery', variant: 'grid', confidence: 0.75, reason: `${images.length} images, little text`, props: { heading: firstHeading?.text || '', columns: Math.min(4, images.length), images: images.map((i) => ({ image: m(i.id), caption: '' })) } };
    }

    if (images.length === 1 && textLen >= 30) {
      const img = images[0];
      const imageLeft = img.x + img.w / 2 < section.bbox.w / 2;
      return { type: 'text-image', variant: imageLeft ? 'image-left' : 'image-right', confidence: 0.75, reason: 'one image beside text', props: { heading: firstHeading?.text || '', body: flowToHtml(flow, { skipFirstHeading: Boolean(firstHeading) }), image: m(img.id), button: btns[0]?.link || { label: '', href: '' } } };
    }

    if (!images.length && textLen < 400 && buttons.length && firstHeading) {
      return { type: 'cta', variant: section.centered ? 'centered' : 'split', confidence: 0.75, reason: 'short heading + button, no image', props: { heading: firstHeading.text, body: paras.map((p) => p.text).join(' '), buttons: btns } };
    }

    if (!images.length && textLen > 0) {
      const width = (section.textRight ?? 0) - (section.textLeft ?? 0);
      // Text laid out in columns is something rich text can't express.
      const columns = /<row cols="[2-9]"/.test(section.simplified);
      return {
        type: 'rich-text', variant: width && width < section.bbox.w * 0.55 ? 'narrow' : 'default', confidence: columns ? 0.5 : 0.8, reason: columns ? 'text only, but laid out in columns' : 'text only',
        props: { body: flowToHtml(flow, { skipFirstHeading: false }) + (buttons.length ? `<p>${buttons.map((b) => `<a href="${rewriteHref(b.href, origin)}">${b.label}</a>`).join(' · ')}</p>` : '') },
      };
    }

    return placeholderFor(section, 'no rule matched');
  }

  function placeholderFor(section, why) {
    const firstHeading = section.flow.find((f) => f.kind === 'h');
    return {
      type: 'placeholder', confidence: 0.2, reason: why,
      props: {
        note: `Imported from section ${section.idx + 1} of the original page: ${why}. Rebuild it with a proper block, or keep it.`,
        heading: firstHeading?.text || '',
        body: flowToHtml(section.flow, { skipFirstHeading: Boolean(firstHeading) }),
        images: section.images.map((i) => ({ image: section.__media(i.id) })),
        buttons: section.buttons.map((b) => ({ link: link(b.label, b.href) })),
      },
    };
  }

  function propsText(type, props) {
    const schema = blocks[type];
    return schema ? shared.collectText(schema.fields, props).join(' ') : '';
  }

  function finalise(section, r, source) {
    const schema = blocks[r.type];
    const { value, errors } = shared.validateProps(schema, r.props);
    const variant = shared.validateVariant(schema, r.variant);
    const cov = coverage(section.text, propsText(r.type, value));
    const style = styleFor(section, r.type);
    if (Object.keys(style).length) value._style = style;
    return { type: r.type, variant, props: value, _meta: { source, confidence: r.confidence, reason: r.reason, section: section.idx, coverage: Math.round(cov.score * 100) / 100, missing: cov.missing.slice(0, 20), errors } };
  }

  // ── dry-dock ───────────────────────────────────────────────────────────
  const catalogText = Object.values(blocks).map((s) => shared.describeSchema(s)).join('\n\n');
  const SYSTEM = `You convert ONE section of a website into ONE block for a small CMS.
Answer with a single JSON object and nothing else:
{"type": "<block type>", "variant": "<variant>", "props": { ... }}

Available block types and their props:
${catalogText}

Rules:
- Copy every piece of visible text exactly as written. Never summarise, shorten, translate or invent text, links or images.
- Images: refer to them by the id from the input (for example "img_3"). Never write an image URL.
- Links and buttons are {"label": "...", "href": "..."} with the href copied exactly from the input.
- richtext values are HTML using only p, strong, em, a, ul, ol, li, h3, h4.
- <row cols="N"> in the input means N columns side by side; <col> is one column.
- Prefer the most specific type that keeps ALL the text. Use "placeholder" only if nothing else fits.`;

  function userPrompt(section, ctx, guess, html) {
    const imgs = section.images.map((i) => `${i.id} (${i.w}x${i.h} at x=${i.x}, y=${i.y})`).join(', ') || 'none';
    return [
      `Section ${section.idx + 1} of ${ctx.total} on page ${ctx.path}${ctx.first ? ' (the first section on the page)' : ''}.`,
      `Size: ${section.bbox.w}x${section.bbox.h}px. Background colour: ${toHex(section.bg) || 'page default'}. Background image: ${section.bgImage || 'none'}.`,
      `Text alignment: ${section.centered ? 'mostly centered' : 'left'}. Images: ${imgs}.`,
      `A simple heuristic guessed "${guess.type}" (${guess.reason}); it may be wrong.`,
      '',
      'Section HTML:',
      html,
    ].join('\n');
  }

  function checkAi(section, obj) {
    const errs = [];
    const schema = blocks[obj?.type];
    if (!schema) return [`"type" must be one of: ${Object.keys(blocks).join(', ')}`];
    if (obj.variant && !(schema.variants || ['default']).includes(obj.variant)) errs.push(`"variant" for ${obj.type} must be one of ${(schema.variants || ['default']).join(', ')}`);
    const { value, errors } = shared.validateProps(schema, obj.props);
    errs.push(...errors);
    shared.walkMedia(schema.fields, value, (v) => { if (!section.__imageIds.has(v.src)) errs.push(`unknown image id "${v.src}" — use only ids from the input`); });
    const cov = coverage(section.text, propsText(obj.type, value));
    if (cov.score < 0.85) errs.push(`text is missing from props (${Math.round(cov.score * 100)}% kept). Include these words: ${cov.missing.slice(0, 15).join(', ')}`);
    return errs;
  }

  return {
    rules,
    placeholderFor,
    finalise,
    flowToHtml,
    link,
    async ai(section, ctx, guess, drydock, log) {
      const html = section.simplified;
      const out = await drydock.json({
        system: SYSTEM,
        prompt: userPrompt(section, ctx, guess, html),
        check: (obj) => checkAi(section, obj),
        shorten: (p) => p.slice(0, Math.floor(p.length * 0.6)),
      });
      const obj = out.value;
      // Resolve "img_3" ids into real media references.
      const schema = blocks[obj.type];
      const { value } = shared.validateProps(schema, obj.props);
      shared.walkMedia(schema.fields, value, (v, set) => set(section.__media(v.src)));
      if (schema.fields) for (const [k, f] of Object.entries(schema.fields)) {
        if (f.type === 'link' && value[k]?.href) value[k].href = rewriteHref(value[k].href, origin);
        if (f.type === 'richtext') value[k] = fixLinks(value[k]);
      }
      log.info(`  section ${section.idx + 1}: dry-dock → ${obj.type} (${out.worker}, ${out.pool}${out.attempts > 1 ? ', fixed on 2nd try' : ''})`);
      return { type: obj.type, variant: obj.variant, props: value, confidence: 0.7, reason: `dry-dock (${out.worker})` };
    },
  };
}

function titleFor(title, siteTitle) {
  const t = String(title || '').trim();
  if (!siteTitle) return t.split(/\s[—|–-]\s/)[0] || t;
  const parts = t.split(/\s[—|–-]\s/);
  const filtered = parts.filter((p) => p.trim().toLowerCase() !== siteTitle.toLowerCase());
  return (filtered.join(' — ') || t).trim();
}

export async function mapSite({ index, pages, theme, options, drydock, log, checkCancel }) {
  const catalog = await loadCatalog();
  const origin = index.origin;
  const mapper = makeMapper({ origin, theme, catalog });
  const cache = new Map();
  const counts = { rule: 0, ai: 0, placeholder: 0 };
  const home = pages[0].data;
  const enrichment = index.enrichment || {};

  const media = (data) => {
    const byId = Object.fromEntries(data.images.map((i) => [i.id, i]));
    const fn = (id) => {
      const im = byId[id];
      return im ? { src: im.src, alt: im.alt || '', width: im.w || undefined, height: im.h || undefined } : null;
    };
    return { fn, ids: new Set(Object.keys(byId)) };
  };

  // Site settings from the home page's header + footer.
  const hm = media(home);
  const header = home.header || {};
  const footer = home.footer || {};
  // The shared suffix of every page title ("About — Roseboom Recording") is
  // the most reliable site name when the header shows only a logo.
  const suffixes = pages.map((p) => String(p.data.title || '').split(/\s[—|–-]\s/)).filter((parts) => parts.length > 1).map((parts) => parts.at(-1).trim());
  const commonSuffix = suffixes.length >= Math.max(1, pages.length / 2) && suffixes.every((x) => x === suffixes[0]) ? suffixes[0] : '';
  const logoAlt = header.logo ? (home.images.find((i) => i.id === header.logo.id)?.alt || '') : '';
  const siteTitle = enrichment.siteTitle || header.siteTitle || commonSuffix || logoAlt || titleFor(home.title, '') || new URL(origin).hostname;
  const allLinks = [...(header.nav || []), ...(footer.links || [])];
  const social = [];
  for (const s of [...(enrichment.social || []), ...allLinks.filter((l) => SOCIAL.test(l.href))]) {
    if (!social.some((x) => x.href === s.href)) social.push({ label: s.label || new URL(s.href).hostname.replace(/^www\./, '').split('.')[0], href: s.href });
  }
  const navItems = (header.nav || []).filter((l) => !SOCIAL.test(l.href));
  const site = {
    siteTitle,
    logo: header.logo ? hm.fn(header.logo.id) : null,
    nav: navItems.map((l) => mapper.link(l.label, l.href)),
    footer: {
      // Paragraphs that are only links become footer links / social below;
      // keeping them as text too would print them twice.
      text: mapper.flowToHtml((footer.flow || []).filter((f) => f.kind !== 'list' && !(f.kind === 'p' && !String(f.html).replace(/<a [^>]*>.*?<\/a>/g, '').replace(/[\s·|•,]/g, ''))), { skipKinds: ['button', 'form'] }),
      links: (footer.links || []).filter((l) => l.label && !SOCIAL.test(l.href) && sameSite(l.href, origin)).map((l) => mapper.link(l.label, l.href)).slice(0, 12),
    },
    social: social.slice(0, 10),
    seoDescription: home.meta.description || enrichment.siteDescription || '',
    fontsHref: theme.fontsHref || undefined,
  };
  if (site.logo && !site.logo.alt) site.logo.alt = siteTitle;
  if (!site.nav.length) site.nav = [{ label: 'Home', href: '/' }];

  const outPages = [];
  const redirects = [];
  for (const p of pages) {
    await checkCancel();
    const data = p.data;
    const { fn, ids } = media(data);
    const pathOut = sitePath(p.path);
    if (pathOut !== p.path && p.path !== '/') redirects.push({ from: p.path, to: pathOut, status: 301 });
    const blocksOut = [];
    log.info(`mapping ${p.path} (${data.sections.length} sections)`);
    for (const section of data.sections) {
      section.__media = fn;
      section.__imageIds = ids;
      const ctx = { first: section.idx === 0, total: data.sections.length, path: p.path };
      let r = mapper.rules(section, ctx);
      let source = r.type === 'placeholder' ? 'placeholder' : 'rule';
      // A rule that lost text isn't confident, however good the match looked.
      const ruleBlock = mapper.finalise(section, r, source);
      if (ruleBlock._meta.coverage < 0.9) r = { ...r, confidence: r.confidence - 0.35 };
      const wantAi = options.ai === 'all' || (options.ai === 'auto' && r.confidence < 0.6);
      let block = ruleBlock;
      if (wantAi && drydock.enabled && section.simplified) {
        const key = hashOf(section.simplified + (section.bg || '') + (section.bgImage || ''));
        try {
          let ai = cache.get(key);
          if (!ai) { ai = await mapper.ai(section, ctx, r, drydock, log); cache.set(key, ai); }
          const aiBlock = mapper.finalise(section, ai, 'ai');
          if (aiBlock._meta.coverage >= ruleBlock._meta.coverage - 0.02 || ruleBlock.type === 'placeholder') block = aiBlock;
          else log.info(`  section ${section.idx + 1}: kept the rule result (${ruleBlock.type}); dry-dock's kept less text`);
        } catch (err) {
          log.warn(`  section ${section.idx + 1}: dry-dock failed (${err.kind || 'error'}: ${err.message}) — using the rule result`);
        }
      }
      if (block._meta.source !== 'ai' && block._meta.coverage < 0.7 && block.type !== 'placeholder') {
        block = mapper.finalise(section, mapper.placeholderFor(section, `the best match (${block.type}) kept only ${Math.round(block._meta.coverage * 100)}% of the text`), 'placeholder');
      }
      counts[block._meta.source === 'ai' ? 'ai' : block.type === 'placeholder' ? 'placeholder' : 'rule']++;
      blocksOut.push(block);
    }
    outPages.push({
      path: pathOut,
      sourcePath: p.path,
      sourceUrl: p.url,
      key: p.key,
      title: titleFor(data.title, siteTitle),
      status: 'published',
      // og:image is left out on purpose: it points at the old site's CDN.
      // The new site derives one from the page's first image (core/server/ssr.js).
      seo: { description: data.meta.description || '' },
      blocks: blocksOut,
    });
  }
  log.info(`mapped ${counts.rule} sections by rule, ${counts.ai} by dry-dock, ${counts.placeholder} left as placeholders`);
  return { site, pages: outPages, redirects, counts };
}
