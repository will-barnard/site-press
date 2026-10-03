import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { BrewBucket } from '../lib/brew-bucket.js';

function tar(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar failed: ${err}`))));
  });
}

// site.tar.gz unpacks to <slug>/ — a ready-to-init repo, uncommitted, for you
// to review and commit. report.tar.gz is the review report on its own.
export async function packageJob({ job, jobDir, slug, log }) {
  const site = path.join(jobDir, 'site.tar.gz');
  const report = path.join(jobDir, 'report.tar.gz');
  await tar(['-czf', site, '--exclude', 'node_modules', '--exclude', 'dist', slug], path.join(jobDir, 'out'));
  await tar(['-czf', report, 'report'], jobDir);
  const sizes = { site: (await fs.stat(site)).size, report: (await fs.stat(report)).size };
  log.info(`packaged ${slug}: site ${(sizes.site / 1048576).toFixed(1)} MB, report ${(sizes.report / 1048576).toFixed(1)} MB`);

  const artifacts = { site: 'site.tar.gz', report: 'report.tar.gz', sizes };
  const bb = config.brewBucket;
  if (bb.baseUrl && bb.apiKey) {
    const client = new BrewBucket({ baseUrl: bb.baseUrl, apiKey: bb.apiKey });
    const prefix = `site-press/${slug}/${new Date().toISOString().slice(0, 10)}-${job.id.slice(0, 8)}`;
    // brew-bucket's 503 means the NAS is asleep or rebooting, not that
    // anything is broken: retry with backoff, and don't fail the job over it
    // — the download from site-press still works.
    for (const [name, file] of [['site', site], ['report', report]]) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await client.putFile(bb.bucket, `${prefix}/${name}.tar.gz`, file, { contentType: 'application/gzip', metadata: { source: job.url, job: job.id } });
          artifacts[`${name}Key`] = `${bb.bucket}/${prefix}/${name}.tar.gz`;
          break;
        } catch (err) {
          if (err.status === 507) { log.warn(`brew-bucket quota exceeded; ${name} not stored there`); break; }
          if (attempt === 4 || (err.status && err.status !== 503)) { log.warn(`brew-bucket upload of ${name} failed: ${err.message}`); break; }
          await new Promise((r) => setTimeout(r, attempt * 5000));
        }
      }
    }
    if (artifacts.siteKey) log.info(`stored in brew-bucket: ${artifacts.siteKey}`);
  } else {
    log.info('BREW_BUCKET_URL / BREW_BUCKET_KEY not set; artifacts are only on the site-press volume');
  }
  return artifacts;
}
