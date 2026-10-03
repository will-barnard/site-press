import fs from 'node:fs/promises';
import path from 'node:path';
import { thumbnail } from './score.js';

// A static, self-contained HTML report: original and rebuild side by side,
// worst sections first, so review time goes where the rebuild is weakest.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const cls = (x, t) => (x >= t ? 'good' : x >= t - 0.15 ? 'warn' : 'bad');

async function copyIf(src, dest) { try { await fs.copyFile(src, dest); return true; } catch { return false; } }

export async function buildReport({ job, jobDir, index, theme, mapped, scores, gen, custom, drydockStats, decisions }) {
  const dir = path.join(jobDir, 'report');
  const img = path.join(dir, 'img');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(img, { recursive: true });
  const primary = index.primary;
  const t = scores.summary.thresholds;

  const pages = Object.values(scores.pages).sort((a, b) => a.sections.filter((s) => s.pass).length / Math.max(1, a.sections.length) - b.sections.filter((s) => s.pass).length / Math.max(1, b.sections.length));
  const pageHtml = [];
  for (const p of pages) {
    const rows = [];
    for (const s of [...p.sections].sort((a, b) => a.visual - b.visual)) {
      const base = `${p.key}-s${s.idx}`;
      await thumbnail(path.join(jobDir, 'capture', p.key, String(primary), `s${s.idx}.png`), path.join(img, `${base}-o.png`));
      await thumbnail(path.join(jobDir, 'rebuild', p.key, String(primary), `s${s.idx}.png`), path.join(img, `${base}-r.png`));
      await copyIf(path.join(jobDir, 'rebuild', p.key, String(primary), `d${s.idx}.png`), path.join(img, `${base}-d.png`));
      const vps = Object.entries(s.perVp).map(([vw, v]) => `<span class="${cls(v.visual, t.visual)}">${vw}px ${pct(v.visual)}</span>`).join(' ');
      rows.push(`<tr class="${s.pass ? 'pass' : 'fail'}">
        <td class="meta"><strong>#${s.idx + 1} ${esc(s.type)}</strong>${s.variant ? ` <span class="muted">${esc(s.variant)}</span>` : ''}
          <div class="tag tag--${esc(s.source)}">${esc(s.source)}</div>
          <div class="muted small">${esc(s.reason || '')}</div>
          <div class="scores"><div>visual <b class="${cls(s.visual, t.visual)}">${pct(s.visual)}</b></div><div>text <b class="${cls(s.text, t.text)}">${pct(s.text)}</b></div><div class="small">${vps}</div></div>
          ${s.missing?.length ? `<div class="small bad">missing: ${esc(s.missing.join(', '))}</div>` : ''}</td>
        <td><img loading="lazy" src="img/${base}-o.png" alt="original"></td>
        <td><img loading="lazy" src="img/${base}-r.png" alt="rebuild"></td>
        <td><img loading="lazy" src="img/${base}-d.png" alt="pixel diff"></td></tr>`);
    }
    const passed = p.sections.filter((s) => s.pass).length;
    pageHtml.push(`<section class="page">
      <h2>${esc(p.path)} <span class="muted">${esc(p.title)}</span></h2>
      <p class="muted"><a href="${esc(p.sourceUrl)}">${esc(p.sourceUrl)}</a> · ${passed}/${p.sections.length} sections pass · page text kept <b class="${cls(p.text, t.text)}">${pct(p.text)}</b>
      ${p.sectionCountMatch ? '' : ' · <span class="bad">section count differs from the original</span>'}
      ${p.brokenLinks.length ? ` · <span class="bad">broken links: ${esc(p.brokenLinks.join(', '))}</span>` : ''}
      ${p.brokenImages.length ? ` · <span class="bad">${p.brokenImages.length} images failed to load</span>` : ''}</p>
      ${p.missing.length ? `<p class="small bad">words on the original page not found on the rebuild: ${esc(p.missing.join(', '))}</p>` : ''}
      <table><thead><tr><th>section</th><th>original</th><th>rebuild</th><th>difference</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    </section>`);
  }

  // Mobile menu, side by side (interactive state: shown, not scored).
  const home = mapped.pages[0];
  let menu = '';
  if (await copyIf(path.join(jobDir, 'capture', home.key, 'menu-375.png'), path.join(img, 'menu-o.png'))) {
    await copyIf(path.join(jobDir, 'rebuild', home.key, 'menu-375.png'), path.join(img, 'menu-r.png'));
    menu = `<section class="page"><h2>Mobile menu (375px, opened)</h2><p class="muted">Not scored — check it by eye.</p><div class="pair"><img src="img/menu-o.png" alt="original menu"><img src="img/menu-r.png" alt="rebuilt menu"></div></section>`;
  }

  const counts = { rule: 0, ai: 0, custom: 0, placeholder: 0 };
  for (const p of mapped.pages) for (const b of p.blocks) counts[b.type === 'placeholder' ? 'placeholder' : (b._meta?.source || 'rule')]++;
  const s = scores.summary;
  const tiles = [
    ['Pages', mapped.pages.length],
    ['Sections passing', `${s.passed}/${s.sections}`],
    ['Mean visual match', pct(s.visual)],
    ['Mean text kept', pct(s.text)],
    ['Mapped by rule / dry-dock / custom', `${counts.rule} / ${counts.ai} / ${counts.custom}`],
    ['Placeholders left', counts.placeholder],
  ];
  const dd = drydockStats?.calls
    ? `<p class="muted">dry-dock: ${drydockStats.calls} calls, ${drydockStats.ok} ok, ${drydockStats.failed} failed, ${drydockStats.fallbacks} pool fallbacks, ${(drydockStats.ms / 1000).toFixed(0)}s total. Answered by: ${esc(Object.entries(drydockStats.workers).map(([w, n]) => `${w} ×${n}`).join(', ') || '—')}</p>`
    : '<p class="muted">dry-dock was not used for this run.</p>';

  const palette = theme.palette.slice(0, 10).map((c) => `<span class="swatch" style="background:${esc(c.color)}" title="${esc(c.color)}"></span>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>site-press report — ${esc(index.origin)}</title>
<style>
:root { --bg:#f6f7f9; --fg:#1d2433; --muted:#6b7385; --card:#fff; --line:#e2e5eb; --good:#067647; --warn:#b54708; --bad:#b42318; }
@media (prefers-color-scheme: dark) { :root { --bg:#14171d; --fg:#e7eaf0; --muted:#98a1b3; --card:#1d222b; --line:#2d3441; --good:#47cd89; --warn:#fdb022; --bad:#f97066; } }
body { margin:0; font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--fg); }
main { max-width:1400px; margin:0 auto; padding:24px 16px 64px; }
h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:17px; margin:0 0 6px; }
a { color:inherit; } .muted { color:var(--muted); } .small { font-size:12px; }
.good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:20px 0; }
.tile { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; } .tile b { display:block; font-size:22px; }
.card, .page { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin:16px 0; overflow-x:auto; }
table { width:100%; border-collapse:collapse; min-width:900px; } th, td { text-align:left; vertical-align:top; padding:10px 8px; border-top:1px solid var(--line); }
td img { width:100%; max-width:420px; border:1px solid var(--line); border-radius:4px; background:#fff; }
td.meta { width:230px; } tr.fail td.meta { border-left:3px solid var(--bad); } tr.pass td.meta { border-left:3px solid var(--good); }
.scores { margin:8px 0; display:grid; gap:2px; }
.tag { display:inline-block; font-size:11px; padding:1px 7px; border-radius:99px; background:var(--line); margin:4px 0; }
.tag--ai { background:#dbe7ff; color:#1d3d8f; } .tag--custom { background:#efe1ff; color:#5a2a8f; } .tag--placeholder { background:#ffe8d5; color:#8a4b00; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; max-width:800px; } .pair img { width:100%; border:1px solid var(--line); }
.swatch { display:inline-block; width:22px; height:22px; border-radius:4px; border:1px solid var(--line); margin-right:4px; vertical-align:middle; }
ul.decisions li { margin-bottom:8px; }
</style></head><body><main>
<h1>Rebuild of ${esc(index.origin)}</h1>
<p class="muted">Job ${esc(job.id)} · ${esc(index.platform)} · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT · pass marks: visual ${pct(t.visual)}, text ${pct(t.text)} (uncalibrated)</p>
<div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span class="muted">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
${dd}
<div class="card"><h2>Needs a decision</h2>${decisions.length ? `<ul class="decisions">${decisions.map((d) => `<li><strong>${esc(d.title)}</strong><br><span class="muted">${esc(d.detail)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing flagged.</p>'}</div>
<div class="card"><h2>Theme</h2><p>${palette}</p><p class="muted small">Fonts: ${esc(theme.families.join(', ') || '—')}${theme.fontsHref ? ' · loaded from Google Fonts' : ''}. Tokens are in site/theme.css.</p>
${custom.length ? `<p class="small">Custom blocks written: ${custom.map((c) => `<code>${esc(c.name)}</code> (${esc(c.page)} #${c.section + 1})`).join(', ')}</p>` : ''}</div>
${menu}
${pageHtml.join('\n')}
</main></body></html>`;
  await fs.writeFile(path.join(dir, 'index.html'), html);
  return dir;
}
