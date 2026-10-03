import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from '../config.js';
import { BrewBucket } from './brew-bucket.js';

// Two storage drivers behind one interface: put(tempPath, file, mime),
// serve(res, file), remove(file). `file` is a flat name like
// "a1b2c3-hero.jpg"; the public URL is always /media/<file>, so pages never
// store a storage-specific address and switching drivers needs no rewrite.

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
export const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

function safeName(file) {
  const base = path.basename(file);
  if (base !== file || base.startsWith('.')) throw Object.assign(new Error('Bad media name'), { status: 400 });
  return base;
}

function localDriver(dir) {
  return {
    name: 'local',
    async put(tempPath, file) {
      await fsp.mkdir(dir, { recursive: true });
      const dest = path.join(dir, safeName(file));
      // copy + unlink rather than rename: the temp dir and the media volume
      // are different filesystems inside the container.
      await fsp.copyFile(tempPath, dest);
    },
    async serve(res, file) {
      const p = path.join(dir, safeName(file));
      try { await fsp.access(p); } catch { return false; }
      res.setHeader('content-type', mimeFor(file));
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      // SVG can carry script; serve it so it can't run as a document.
      if (file.endsWith('.svg')) res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
      fs.createReadStream(p).pipe(res);
      return true;
    },
    async remove(file) { await fsp.rm(path.join(dir, safeName(file)), { force: true }); },
  };
}

function brewBucketDriver(opts) {
  if (!opts.baseUrl || !opts.apiKey) throw new Error('MEDIA_DRIVER=brew-bucket needs BREW_BUCKET_URL and BREW_BUCKET_KEY');
  const bb = new BrewBucket({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
  const key = (file) => `${opts.prefix}/${safeName(file)}`;
  return {
    name: 'brew-bucket',
    async put(tempPath, file, mime) {
      await bb.putFile(opts.bucket, key(file), tempPath, { contentType: mime || mimeFor(file) });
    },
    async serve(res, file) {
      let upstream;
      try { upstream = await bb.get(opts.bucket, key(file)); } catch (err) {
        if (err.status === 404) return false;
        // 503 from brew-bucket means the NAS is asleep or off the LAN, not
        // that the image is gone. Say so instead of a broken-image 404.
        res.status(err.status === 503 ? 503 : 502).end();
        return true;
      }
      res.setHeader('content-type', upstream.headers.get('content-type') || mimeFor(file));
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      Readable.fromWeb(upstream.body).pipe(res);
      return true;
    },
    async remove(file) { await bb.delete(opts.bucket, key(file)).catch((err) => { if (err.status !== 404) throw err; }); },
  };
}

let driver = null;
export function media() {
  if (!driver) {
    driver = config.media.driver === 'brew-bucket' && !config.preview
      ? brewBucketDriver(config.media.brewBucket)
      : localDriver(config.media.dir);
  }
  return driver;
}
