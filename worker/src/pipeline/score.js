import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Visual score for one pair of section screenshots, 0..1.
//   pixels  — share of pixels that match (pixelmatch, anti-aliasing tolerant)
//   ssim    — structural similarity on greyscale; forgiving of small colour
//             shifts, harsh on misplaced blocks
//   height  — min/max of the two heights; a section twice as tall as the
//             original is wrong however similar its top half looks
// Both images are downscaled to one width and padded to one height first.
const W = 360;

async function readPng(file) {
  try { return PNG.sync.read(await fs.readFile(file)); } catch { return null; }
}

// Box-filter downscale to width W, keeping aspect. Plenty for scoring and
// thumbnails, and avoids a native image library in the worker.
export function downscale(img, width = W) {
  const scale = img.width / width;
  if (scale <= 1) return img;
  const height = Math.max(1, Math.round(img.height / scale));
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.min(img.height, Math.floor((y + 1) * scale));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(img.width, Math.floor((x + 1) * scale));
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * width + x) * 4;
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
    }
  }
  return out;
}

function padTo(img, height) {
  if (img.height === height) return img;
  const out = new PNG({ width: img.width, height });
  out.data.fill(255);
  img.data.copy(out.data, 0, 0, img.data.length);
  return out;
}

function grey(img) {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return g;
}

export function ssim(a, b, width, height, win = 8) {
  const ga = grey(a);
  const gb = grey(b);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let count = 0;
  for (let y = 0; y + win <= height; y += win) {
    for (let x = 0; x + win <= width; x += win) {
      let ma = 0; let mb = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const k = (y + j) * width + x + i; ma += ga[k]; mb += gb[k]; }
      const n = win * win;
      ma /= n; mb /= n;
      let va = 0; let vb = 0; let cov = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
        const k = (y + j) * width + x + i;
        const da = ga[k] - ma; const db = gb[k] - mb;
        va += da * da; vb += db * db; cov += da * db;
      }
      va /= n - 1; vb /= n - 1; cov /= n - 1;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? total / count : 1;
}

export async function scorePair(origFile, rebuiltFile, { diffFile } = {}) {
  const [a0, b0] = await Promise.all([readPng(origFile), readPng(rebuiltFile)]);
  if (!a0 || !b0) return { visual: 0, pixels: 0, ssim: 0, height: 0, missing: !a0 ? 'original' : 'rebuild' };
  const w = Math.min(W, a0.width, b0.width);
  const a1 = downscale(a0, w);
  const b1 = downscale(b0, w);
  if (a1.width !== b1.width) return { visual: 0, pixels: 0, ssim: 0, height: 0, missing: 'width mismatch' };
  const h = Math.max(a1.height, b1.height);
  const a = padTo(a1, h);
  const b = padTo(b1, h);
  const diff = new PNG({ width: a.width, height: h });
  const mismatched = pixelmatch(a.data, b.data, diff.data, a.width, h, { threshold: 0.15, includeAA: false, alpha: 0.3 });
  const pixels = 1 - mismatched / (a.width * h);
  const s = Math.max(0, ssim(a, b, a.width, h));
  const height = Math.min(a0.height, b0.height) / Math.max(a0.height, b0.height);
  if (diffFile) await fs.writeFile(diffFile, PNG.sync.write(diff));
  const visual = 0.35 * pixels + 0.45 * s + 0.2 * height;
  const r2 = (x) => Math.round(x * 1000) / 1000;
  return { visual: r2(visual), pixels: r2(pixels), ssim: r2(s), height: r2(height), origH: a0.height, rebuiltH: b0.height };
}

export async function thumbnail(src, dest, width = 480) {
  const img = await readPng(src);
  if (!img) return false;
  await fs.writeFile(dest, PNG.sync.write(downscale(img, width)));
  return true;
}
