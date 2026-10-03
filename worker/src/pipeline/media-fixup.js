import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { loadCatalog } from './catalog.js';
import { squarespaceImageUrl } from './adapters/squarespace.js';

// Custom blocks are written after the main media download, so their images
// still point at the original site. Pull those in the same way.
export async function localiseMedia({ mapped, outDir, seed, custom, log }) {
  const { shared, imageSize } = await loadCatalog();
  const names = new Set(custom.map((c) => c.name));
  const dir = path.join(outDir, 'site/seed-media');
  for (const page of mapped.pages) {
    for (const b of page.blocks) {
      if (!names.has(b.type) || !b._schema) continue;
      const jobs = [];
      shared.walkMedia(b._schema.fields, b.props, (v, set) => { if (/^https?:/.test(v.src)) jobs.push({ v, set }); });
      for (const { v, set } of jobs) {
        try {
          const res = await fetch(squarespaceImageUrl(v.src), { headers: { 'user-agent': config.userAgent }, signal: AbortSignal.timeout(45000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          const meta = imageSize.parse(buf);
          if (!meta) throw new Error('not an image');
          const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[meta.mime];
          const file = `${crypto.createHash('sha1').update(v.src).digest('hex').slice(0, 8)}-custom.${ext}`;
          await fs.writeFile(path.join(dir, file), buf);
          set({ src: `/media/${file}`, alt: v.alt || '', width: meta.width || v.width, height: meta.height || v.height });
          if (!seed.media.some((m) => m.file === file)) seed.media.push({ file, alt: v.alt || '', width: meta.width, height: meta.height, mime: meta.mime, size: buf.length });
        } catch (err) {
          log.warn(`custom block image ${v.src}: ${err.message}`);
        }
      }
    }
  }
}
