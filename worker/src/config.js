import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  db: env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), database: env.DB_NAME || 'sitepress', user: env.DB_USER || 'postgres', password: env.DB_PASSWORD || '' },
  jobsDir: env.JOBS_DIR || '/data/jobs',
  templateDir: env.TEMPLATE_DIR || path.resolve(here, '../../template'),
  // node_modules with every template dependency (dev deps included), baked
  // into the worker image so verify can build a generated site offline.
  templateDeps: env.TEMPLATE_DEPS_DIR || '/opt/template-deps/node_modules',
  pollMs: Number(env.WORKER_POLL_MS || 3000),
  userAgent: env.CAPTURE_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 site-press',
  drydock: {
    baseUrl: (env.DRYDOCK_BASE_URL || '').replace(/\/$/, ''),
    apiKey: env.DRYDOCK_API_KEY || '',
    // coder = the MacBook's qwen2.5-coder:32b. Pinning it means a sleeping
    // MacBook answers 503; DRYDOCK_FALLBACK_UNPINNED lets that one call go
    // to whatever pool is awake instead of degrading to rules-only.
    pool: env.DRYDOCK_POOL ?? 'coder',
    model: env.DRYDOCK_MODEL || undefined,
    fallbackUnpinned: env.DRYDOCK_FALLBACK_UNPINNED !== '0',
    timeout: Number(env.DRYDOCK_TIMEOUT || 120),
  },
  brewBucket: {
    baseUrl: env.BREW_BUCKET_URL || '',
    apiKey: env.BREW_BUCKET_KEY || '',
    bucket: env.BREW_BUCKET_ARTIFACTS || 'artifacts',
  },
  // Pass marks. Placeholders until calibrated against sites you've already
  // rebuilt by hand (Phase 0 in the scope doc) — expect to move them.
  thresholds: {
    visual: Number(env.PASS_VISUAL || 0.72),
    text: Number(env.PASS_TEXT || 0.97),
  },
};
