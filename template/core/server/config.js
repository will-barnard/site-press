import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const env = process.env;
const production = env.NODE_ENV === 'production';

export const config = {
  root: ROOT,
  port: Number(env.PORT || 3000),
  production,
  // Preview mode serves straight from site/seed.json with no database. It is
  // how site-press verifies a rebuild, and how you look at one locally before
  // there's a Postgres to point it at. The admin is read-only (503) in it.
  preview: env.SITE_PREVIEW_SEED === '1',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  db: env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.DB_HOST || 'localhost',
        port: Number(env.DB_PORT || 5432),
        database: env.DB_NAME || 'site',
        user: env.DB_USER || 'postgres',
        password: env.DB_PASSWORD || '',
      },
  bootstrapToken: env.ADMIN_BOOTSTRAP_TOKEN || '',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : production,
  seedOnBoot: env.SEED_ON_BOOT !== '0',
  media: {
    driver: env.MEDIA_DRIVER || (env.BREW_BUCKET_URL && env.BREW_BUCKET_KEY ? 'brew-bucket' : 'local'),
    dir: env.MEDIA_DIR || (env.SITE_PREVIEW_SEED === '1' ? path.join(ROOT, 'site/seed-media') : '/data/media'),
    maxBytes: Number(env.MEDIA_MAX_MB || 25) * 1024 * 1024,
    brewBucket: {
      baseUrl: env.BREW_BUCKET_URL,
      apiKey: env.BREW_BUCKET_KEY,
      bucket: env.BREW_BUCKET_BUCKET || 'uploads',
      prefix: (env.BREW_BUCKET_PREFIX || 'site').replace(/\/$/, ''),
    },
  },
  distDir: path.join(ROOT, 'dist'),
};

export function configError(message) {
  return Object.assign(new Error(message), { status: 500, config: true });
}
