// Runs INSIDE the page via page.evaluate(extractPage, opts). It must be fully
// self-contained: Playwright serialises the function source, so nothing from
// the enclosing module (imports, constants, helpers) exists in the browser.
//
// One extractor serves both sides of the comparison. On the original site it
// finds sections heuristically; on the rebuild it reads [data-sp-block]
// (opts.sectionSelector), so section i on one side pairs with section i on
// the other.

export function extractPage(opts = {}) {
  const lite = Boolean(opts.lite);
  const vw = window.innerWidth;
  const scrollY = window.scrollY;
  let imgCounter = 0;
  const imageIndex = new Map();

  const cs = (el) => getComputedStyle(el);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const visible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const s = cs(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const isTransparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);

  // ── platform ───────────────────────────────────────────────────────────
  const generator = document.querySelector('meta[name="generator"]')?.content || '';
  const html = document.documentElement;
  let platform = 'unknown';
  if (/squarespace/i.test(generator) || window.Static?.SQUARESPACE_CONTEXT || document.querySelector('script[src*="squarespace"]')) platform = 'squarespace';
  else if (/wix/i.test(generator) || document.querySelector('meta[name="generator"][content*="Wix"]')) platform = 'wix';
  else if (/wordpress/i.test(generator) || document.querySelector('link[href*="/wp-content/"]')) platform = 'wordpress';
  else if (html.hasAttribute('data-wf-site')) platform = 'webflow';

  // ── images ─────────────────────────────────────────────────────────────
  function bestSrc(img) {
    // Squarespace and most lazy loaders keep the real URL in a data attribute
    // until the image scrolls into view; prefer it over a placeholder src.
    const candidates = [img.getAttribute('data-src'), img.getAttribute('data-image'), img.currentSrc, img.src];
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (srcset) {
      const best = srcset.split(',').map((s) => s.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 })).sort((a, b) => b.w - a.w)[0];
      if (best) candidates.unshift(best.u);
    }
    for (const c of candidates) if (c && !c.startsWith('data:')) return abs(c);
    return null;
  }
  function registerImage(src, alt, w, h, extra = {}) {
    if (!src) return null;
    if (imageIndex.has(src)) return imageIndex.get(src).id;
    const id = `img_${imgCounter++}`;
    imageIndex.set(src, { id, src, alt: clean(alt), w, h, ...extra });
    return id;
  }
  function bgImageOf(el) {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(cs(el).backgroundImage || '');
    return m && !m[1].startsWith('data:') ? abs(m[1]) : null;
  }

  // ── inline html (strong/em/a only) ─────────────────────────────────────
  function inlineHtml(el) {
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' ').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); continue; }
      if (n.nodeType !== 1 || !visible(n)) continue;
      const tag = n.tagName.toLowerCase();
      const inner = inlineHtml(n);
      if (tag === 'br') out += '<br>';
      else if (tag === 'strong' || tag === 'b' || (tag === 'span' && Number(cs(n).fontWeight) >= 600)) out += `<strong>${inner}</strong>`;
      else if (tag === 'em' || tag === 'i') out += `<em>${inner}</em>`;
      else if (tag === 'a' && n.getAttribute('href')) out += `<a href="${abs(n.getAttribute('href')).replace(/"/g, '&quot;')}">${inner}</a>`;
      else out += inner;
    }
    return out.replace(/\s+/g, ' ');
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg', 'CANVAS', 'HEAD']);
  const BUTTONISH = (a) => {
    const c = `${a.className} ${a.parentElement?.className || ''}`;
    if (/button|btn|cta/i.test(c)) return true;
    const s = cs(a);
    return !isTransparent(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.paddingLeft) > 8);
  };

  // Walks a section in document order, producing: the ordered "flow" of text
  // blocks, the compact HTML sent to dry-dock, and lists of images, buttons,
  // iframes and forms.
  function walkSection(root, ctx) {
    const flow = [];
    const parts = [];
    const images = [];
    const buttons = [];
    const iframes = [];
    const forms = [];
    const quotes = [];
    const sectionRect = root.getBoundingClientRect();

    function addImage(src, alt, el) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 30) return null;
      const id = registerImage(src, alt, el.naturalWidth || Math.round(r.width), el.naturalHeight || Math.round(r.height));
      if (!images.some((i) => i.id === id)) {
        images.push({ id, x: Math.round(r.left - sectionRect.left), y: Math.round(r.top - sectionRect.top), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return id;
    }

    function walk(el, depth) {
      if (!(el instanceof Element) || SKIP.has(el.tagName) || !visible(el)) return;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const text = clean(el.innerText);
        if (text) { flow.push({ kind: 'h', level: Number(tag[1]), text, html: inlineHtml(el), size: parseFloat(cs(el).fontSize) }); parts.push(`<${tag}>${text}</${tag}>`); }
        return;
      }
      if (tag === 'p' || (tag === 'div' && el.children.length === 0 && clean(el.innerText).length > 0)) {
        const text = clean(el.innerText);
        if (!text) return;
        // A lone link styled as a button is a button, not a paragraph.
        const onlyLink = el.children.length === 1 && el.children[0].tagName === 'A' && clean(el.children[0].innerText) === text;
        if (onlyLink && BUTTONISH(el.children[0])) { walk(el.children[0], depth + 1); return; }
        flow.push({ kind: 'p', text, html: inlineHtml(el), size: parseFloat(cs(el).fontSize) });
        parts.push(`<p>${inlineHtml(el)}</p>`);
        el.querySelectorAll('img').forEach((img) => { const s = bestSrc(img); if (s) addImage(s, img.alt, img); });
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        const items = [...el.children].filter((li) => li.tagName === 'LI' && visible(li));
        const looksLikeCards = items.length > 1 && items.every((li) => li.querySelector('img, h2, h3, h4'));
        if (!looksLikeCards) {
          const htmlItems = items.map((li) => inlineHtml(li).trim()).filter(Boolean);
          if (htmlItems.length) { flow.push({ kind: 'list', ordered: tag === 'ol', items: htmlItems, text: htmlItems.join(' ') }); parts.push(`<${tag}>${htmlItems.map((i) => `<li>${i}</li>`).join('')}</${tag}>`); }
          return;
        }
      }
      if (tag === 'blockquote' || el.classList.contains('sqs-block-quote')) {
        const text = clean(el.innerText);
        if (text) { quotes.push(text); flow.push({ kind: 'quote', text }); parts.push(`<blockquote>${text}</blockquote>`); }
        return;
      }
      if (tag === 'img') {
        const src = bestSrc(el);
        if (!src) return;
        const id = addImage(src, el.alt, el);
        if (id) parts.push(`<img id="${id}" alt="${clean(el.alt)}">`);
        return;
      }
      if (tag === 'picture') { const img = el.querySelector('img'); if (img) walk(img, depth + 1); return; }
      if (tag === 'iframe') {
        const src = abs(el.getAttribute('src') || el.getAttribute('data-src') || '');
        if (src) { iframes.push(src); parts.push(`<iframe src="${src}"></iframe>`); }
        return;
      }
      if (tag === 'a' && el.getAttribute('href') && BUTTONISH(el) && clean(el.innerText).length < 60 && !el.querySelector('img')) {
        const b = { label: clean(el.innerText), href: abs(el.getAttribute('href')) };
        if (b.label) { buttons.push(b); flow.push({ kind: 'button', ...b, text: b.label }); parts.push(`<a button href="${b.href}">${b.label}</a>`); }
        return;
      }
      if (tag === 'form') {
        const fields = [];
        el.querySelectorAll('input, textarea, select').forEach((f) => {
          const type = (f.getAttribute('type') || f.tagName.toLowerCase()).toLowerCase();
          if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type) || !visible(f)) return;
          const id = f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`);
          const label = clean(id?.innerText || f.closest('label')?.innerText || f.closest('.field, .form-item')?.querySelector('label, .title, legend')?.innerText || f.getAttribute('aria-label') || f.getAttribute('placeholder') || f.name || type);
          fields.push({ label: label.replace(/\s*\*\s*$/, '').replace(/\(required\)/i, '').trim(), name: f.name || label, type: f.tagName === 'TEXTAREA' ? 'textarea' : (['email', 'tel'].includes(type) ? type : 'text'), required: f.required || /\*|required/i.test(label) });
        });
        const submit = clean(el.querySelector('[type=submit], button')?.innerText || 'Submit');
        forms.push({ fields, submit });
        parts.push(`<form>${fields.map((f) => `<input type="${f.type}" label="${f.label}"${f.required ? ' required' : ''}>`).join('')}<button>${submit}</button></form>`);
        flow.push({ kind: 'form', text: fields.map((f) => f.label).join(' ') + ' ' + submit });
        return;
      }
      if (tag === 'button') return;
      // Background images on non-root containers (cards, banners).
      if (depth > 0) { const bg = bgImageOf(el); if (bg) { const r = el.getBoundingClientRect(); if (r.width > 120 && r.height > 80) addImage(bg, '', el); } }

      const s = cs(el);
      const kids = [...el.children].filter(visible);
      const row = (s.display.includes('flex') && !s.flexDirection.startsWith('column')) || s.display.includes('grid');
      const sideBySide = row && kids.length > 1 && kids.filter((k) => Math.abs(k.getBoundingClientRect().top - kids[0].getBoundingClientRect().top) < 24).length > 1;
      if (sideBySide) parts.push(`<row cols="${kids.length}">`);
      for (const k of el.childNodes) {
        if (k.nodeType === 3) {
          const t = clean(k.textContent);
          if (t && t.length > 1) { flow.push({ kind: 'p', text: t, html: t }); parts.push(`<p>${t}</p>`); }
        } else if (k.nodeType === 1) {
          if (sideBySide) parts.push('<col>');
          walk(k, depth + 1);
          if (sideBySide) parts.push('</col>');
        }
      }
      if (sideBySide) parts.push('</row>');
    }

    walk(root, 0);
    return { flow, images, buttons, iframes, forms, quotes, simplified: parts.join('').replace(/<col><\/col>/g, '').slice(0, 7000) };
  }

  // Repeated sibling items with the same shape (image/title/text) — services,
  // team members, feature lists. Picks the container with the most items.
  function findRepeats(root) {
    let best = null;
    const all = [root, ...root.querySelectorAll('*')].slice(0, 4000);
    for (const el of all) {
      const kids = [...el.children].filter(visible);
      if (kids.length < 2 || kids.length > 24) continue;
      const leavesOf = (k) => [...k.querySelectorAll('*')].filter((e) => e.children.length === 0 && visible(e) && clean(e.innerText));
      const sig = (k) => {
        const s = `${k.querySelector('img') || bgImageOf(k) ? 'i' : ''}${k.querySelector('h1,h2,h3,h4,h5,strong') ? 'h' : ''}${clean(k.innerText).length > 30 ? 't' : ''}`;
        // Short multi-line text items with no image or heading: stat rows,
        // "number + label" strips. Only counted when they sit side by side.
        if (!s.includes('i') && !s.includes('h') && leavesOf(k).length >= 2 && clean(k.innerText).length < 160) return 'm';
        return s;
      };
      const sigs = kids.map(sig);
      const main = sigs[0];
      if (!main || main === 't' || sigs.filter((s) => s === main).length < Math.max(2, kids.length * 0.75)) continue;
      const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
      const perRow = tops.filter((t) => Math.abs(t - tops[0]) < 24).length;
      if (perRow < 2 && (vw > 900 || main === 'm')) continue; // stacked vertically at desktop width = a list, not cards
      if (!best || kids.length > best.kids.length) best = { el, kids, perRow, textOnly: main === 'm' };
    }
    if (!best) return null;
    return {
      columns: best.perRow,
      textOnly: best.textOnly,
      items: best.kids.map((k) => {
        let h = k.querySelector('h1,h2,h3,h4,h5') || k.querySelector('strong');
        if (!h && best.textOnly) h = [...k.querySelectorAll('*')].filter((e) => e.children.length === 0 && clean(e.innerText)).sort((a, b) => parseFloat(cs(b).fontSize) - parseFloat(cs(a).fontSize))[0];
        const img = k.querySelector('img');
        const bg = !img && (bgImageOf(k) || [...k.querySelectorAll('*')].map(bgImageOf).find(Boolean));
        const src = img ? bestSrc(img) : bg;
        const imgId = src ? registerImage(src, img?.alt || '', img?.naturalWidth || 0, img?.naturalHeight || 0) : null;
        const link = [...k.querySelectorAll('a[href]')].find((a) => clean(a.innerText)) || k.closest('a[href]') || k.querySelector('a[href]');
        const textEls = best.textOnly ? [...k.querySelectorAll('*')].filter((e) => e.children.length === 0 && clean(e.innerText)) : [...k.querySelectorAll('p, li')];
        const paras = textEls.filter(visible).filter((p) => !h || (!h.contains(p) && !p.contains(h))).map(inlineHtml).map((x) => x.trim()).filter(Boolean);
        return {
          title: h ? clean(h.innerText) : '',
          body: paras.length ? paras.map((p) => `<p>${p}</p>`).join('') : '',
          text: clean(k.innerText),
          imgId,
          link: link ? { label: clean(link.innerText).slice(0, 60), href: abs(link.getAttribute('href')) } : null,
        };
      }),
    };
  }

  // ── section discovery ──────────────────────────────────────────────────
  function bigEnough(el) { const r = el.getBoundingClientRect(); return visible(el) && r.height > 40 && r.width > Math.min(400, vw * 0.5); }
  const headerEl = [...document.querySelectorAll('header, #header, [role="banner"], .header, [data-nc-group="top"]')].find((el) => visible(el) && el.getBoundingClientRect().top + scrollY < 250);
  const footerEl = [...document.querySelectorAll('footer, #footer, #footer-sections, [role="contentinfo"], .footer')].filter(visible).pop();
  const inChrome = (el) => (headerEl && (headerEl.contains(el) || el.contains(headerEl))) || (footerEl && (footerEl.contains(el) || el.contains(footerEl)));

  function findSections() {
    if (opts.sectionSelector) return [...document.querySelectorAll(opts.sectionSelector)].filter(visible);
    let els = [...document.querySelectorAll('section.page-section')].filter((e) => bigEnough(e) && !inChrome(e)); // Squarespace 7.1
    if (els.length) return els;
    els = [...document.querySelectorAll('.index-section, .Index-page, .sqs-layout > .row')].filter((e) => bigEnough(e) && !inChrome(e)); // Squarespace 7.0
    if (els.length > 1) return els;
    let root = document.querySelector('main, [role="main"], #main, #content') || document.body;
    for (let i = 0; i < 8; i++) {
      const kids = [...root.children].filter((k) => bigEnough(k) && !inChrome(k));
      if (kids.length === 1) root = kids[0]; else break;
    }
    let kids = [...root.children].filter((k) => bigEnough(k) && !inChrome(k) && !['SCRIPT', 'STYLE', 'NAV'].includes(k.tagName));
    // One giant section usually means we stopped a level too high: split it.
    kids = kids.flatMap((k) => {
      const r = k.getBoundingClientRect();
      const sub = [...k.children].filter(bigEnough);
      return r.height > window.innerHeight * 2.5 && sub.length > 1 ? sub : [k];
    });
    return kids.length ? kids : [root];
  }

  // ── styles ─────────────────────────────────────────────────────────────
  function styleOf(el) {
    if (!el) return null;
    const s = cs(el);
    return {
      fontFamily: s.fontFamily, fontSize: parseFloat(s.fontSize), fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, textTransform: s.textTransform, color: s.color, backgroundColor: s.backgroundColor,
      borderRadius: s.borderTopLeftRadius, paddingTop: s.paddingTop, paddingLeft: s.paddingLeft, borderColor: s.borderTopColor, borderWidth: s.borderTopWidth,
    };
  }
  const firstVisible = (sel) => [...document.querySelectorAll(sel)].find((e) => visible(e) && !inChrome(e));
  // The paragraph style that covers the most text — not the first <p>, which
  // is usually white type over the hero photo.
  function typical(sel) {
    const tally = new Map();
    for (const e of document.querySelectorAll(sel)) {
      if (!visible(e) || inChrome(e)) continue;
      const s = cs(e);
      const k = `${s.fontFamily}|${s.fontSize}|${s.color}`;
      const t = tally.get(k) || { el: e, n: 0 };
      t.n += clean(e.innerText).length;
      tally.set(k, t);
    }
    return [...tally.values()].sort((a, b) => b.n - a.n)[0]?.el || null;
  }

  function bgOf(el) {
    // Walk up until something paints a background.
    for (let e = el; e; e = e.parentElement) {
      const c = cs(e).backgroundColor;
      if (!isTransparent(c)) return c;
    }
    return 'rgb(255, 255, 255)';
  }

  // ── run ────────────────────────────────────────────────────────────────
  const sectionEls = findSections();
  const sections = sectionEls.map((el, idx) => {
    const bbox = rectOf(el);
    const base = { idx, bbox, text: clean(el.innerText) };
    if (lite) {
      const brokenImages = [...el.querySelectorAll('img')].filter((i) => visible(i) && i.complete && i.naturalWidth === 0).length;
      return { ...base, brokenImages };
    }
    // Squarespace 7.1 keeps a section's background photo in .section-background.
    const bgImgEl = el.querySelector(':scope > .section-background img, :scope .section-background img');
    let bgImage = null;
    if (bgImgEl && visible(bgImgEl)) bgImage = registerImage(bestSrc(bgImgEl), bgImgEl.alt, bgImgEl.naturalWidth, bgImgEl.naturalHeight);
    else { const bg = bgImageOf(el); if (bg) bgImage = registerImage(bg, '', 0, 0); }
    const w = walkSection(el, {});
    if (bgImage) w.images = w.images.filter((i) => i.id !== bgImage);
    // Leaf text elements too, so a stats strip built from bare <div>s still
    // counts as centred text.
    const textEls = [...el.querySelectorAll('h1,h2,h3,h4,p,li,a,blockquote,div,span')].filter((t) => visible(t) && (['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'A', 'BLOCKQUOTE'].includes(t.tagName) || (t.children.length === 0 && clean(t.innerText))));
    // Padding = distance to the first CONTENT (text or image), not first
    // text: a heading centred beside a tall image sits far below the edge.
    const secR = el.getBoundingClientRect();
    const contentImgs = [...el.querySelectorAll('img')].filter((i) => {
      if (!visible(i) || i === bgImgEl) return false;
      const r = i.getBoundingClientRect();
      return r.width * r.height < secR.width * secR.height * 0.6; // full-bleed backgrounds aren't content
    });
    const contentTops = [...textEls, ...contentImgs].map((t) => t.getBoundingClientRect().top);
    const firstText = contentTops.length ? { top: Math.min(...contentTops) } : null;
    const lefts = textEls.map((t) => t.getBoundingClientRect().left).sort((a, b) => a - b);
    const rights = textEls.map((t) => t.getBoundingClientRect().right).sort((a, b) => b - a);
    const centered = textEls.length > 0 && textEls.filter((t) => cs(t).textAlign === 'center').length / textEls.length > 0.6;
    const sbg = cs(el).backgroundColor;
    return {
      ...base,
      bg: isTransparent(sbg) ? null : sbg,
      color: textEls[0] ? cs(textEls[0]).color : cs(el).color,
      bgImage,
      overlay: bgImage ? [...el.querySelectorAll('.section-background-overlay, [class*=overlay]')].map((o) => Number(cs(o).opacity) * (isTransparent(cs(o).backgroundColor) ? 0 : 1)).find((o) => o > 0) ?? null : null,
      padTop: firstText ? Math.round(firstText.top - el.getBoundingClientRect().top) : null,
      textLeft: lefts.length ? Math.round(lefts[0]) : null,
      textRight: rights.length ? Math.round(rights[0]) : null,
      centered,
      repeats: findRepeats(el),
      ...w,
    };
  });

  const brokenImages = [...document.querySelectorAll('img')].filter((i) => visible(i) && i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
  const links = [...new Set([...document.querySelectorAll('a[href]')].map((a) => abs(a.getAttribute('href'))).filter(Boolean))];
  if (lite) return { url: location.href, docHeight: document.documentElement.scrollHeight, sections, links, brokenImages };

  // Header + footer become site settings rather than blocks.
  let header = null;
  if (headerEl) {
    const logoImg = [...headerEl.querySelectorAll('img')].find(visible);
    const homeLink = [...headerEl.querySelectorAll('a[href]')].find((a) => { try { const u = new URL(a.href); return u.host === location.host && (u.pathname === '/' || u.pathname === ''); } catch { return false; } });
    const navLinks = [...headerEl.querySelectorAll('nav a[href], a[href]')].filter((a) => visible(a) && clean(a.innerText) && a !== homeLink && !a.querySelector('img'));
    const seen = new Set();
    const nav = [];
    for (const a of navLinks) {
      const href = abs(a.getAttribute('href'));
      const label = clean(a.innerText);
      const k = `${label}|${href}`;
      if (!href || seen.has(k) || /cart|account|login|sign in/i.test(label)) continue;
      seen.add(k);
      nav.push({ label, href, button: BUTTONISH(a) });
    }
    const hs = cs(headerEl);
    header = {
      bbox: rectOf(headerEl),
      logo: logoImg ? { id: registerImage(bestSrc(logoImg), logoImg.alt, logoImg.naturalWidth, logoImg.naturalHeight), h: Math.round(logoImg.getBoundingClientRect().height), w: Math.round(logoImg.getBoundingClientRect().width) } : null,
      siteTitle: clean(homeLink?.innerText) || '',
      nav: nav.slice(0, 12),
      bg: isTransparent(hs.backgroundColor) ? null : hs.backgroundColor,
      color: navLinks[0] ? cs(navLinks[0]).color : hs.color,
      navSize: navLinks[0] ? parseFloat(cs(navLinks[0]).fontSize) : null,
      position: ['fixed', 'sticky'].includes(hs.position) ? 'sticky' : 'relative',
      overlaysContent: hs.position === 'absolute' || hs.position === 'fixed',
    };
  }
  let footer = null;
  if (footerEl) {
    const w = walkSection(footerEl, {});
    const fl = [...footerEl.querySelectorAll('a[href]')].filter(visible).map((a) => ({ label: clean(a.innerText) || a.getAttribute('aria-label') || '', href: abs(a.getAttribute('href')) })).filter((l) => l.href);
    const fs = cs(footerEl);
    footer = { bbox: rectOf(footerEl), flow: w.flow, links: fl, bg: bgOf(footerEl), color: fs.color, text: clean(footerEl.innerText) };
  }

  // Colour palette weighted by painted area (backgrounds) and text length.
  const palette = {};
  const add = (c, n) => { if (!isTransparent(c)) palette[c] = (palette[c] || 0) + n; };
  [...document.querySelectorAll('body *')].slice(0, 5000).forEach((e) => {
    if (!visible(e)) return;
    const r = e.getBoundingClientRect();
    const s = cs(e);
    add(s.backgroundColor, (r.width * r.height) / 1000);
    if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) add(s.color, e.textContent.trim().length);
  });

  const main = document.querySelector('main') || document.body;
  const textBlocks = [...main.querySelectorAll('p, h1, h2, h3')].filter((e) => visible(e) && !inChrome(e)).map((e) => e.getBoundingClientRect().left).filter((l) => l > 0).sort((a, b) => a - b);
  const gutter = textBlocks.length ? textBlocks[Math.floor(textBlocks.length * 0.1)] : 24;

  const fontLinks = [...document.querySelectorAll('link[rel="stylesheet"][href], link[rel="preload"][href]')].map((l) => l.href).filter((h) => /fonts\.googleapis\.com|use\.typekit\.net|p\.typekit\.net|fonts\.bunny\.net/.test(h));
  const fontFaces = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))];
  const body = document.body;

  return {
    url: location.href,
    title: document.title,
    lang: html.lang || 'en',
    meta: {
      description: document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      generator,
    },
    platform,
    docHeight: document.documentElement.scrollHeight,
    header,
    footer,
    sections,
    images: [...imageIndex.values()],
    styles: {
      body: { ...styleOf(body), backgroundColor: bgOf(main.querySelector('p') || main) },
      h1: styleOf(firstVisible('h1')),
      h2: styleOf(firstVisible('h2')),
      h3: styleOf(firstVisible('h3')),
      p: styleOf(typical('main p, p')),
      link: styleOf(typical('main p a, p a')),
      button: styleOf(firstVisible('.sqs-block-button-element, .sqs-button-element--primary, a.btn, a.button, .wp-block-button__link, a[class*="button"], button[type="submit"]')),
      gutter: Math.round(gutter),
      viewport: vw,
    },
    palette: Object.entries(palette).sort((a, b) => b[1] - a[1]).slice(0, 12),
    fontLinks,
    fontFaces,
    links,
    brokenImages,
  };
}
