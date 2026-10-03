const env = process.env;
export const config = {
  port: Number(env.PORT || 3001),
  production: env.NODE_ENV === 'production',
  db: env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), database: env.DB_NAME || 'sitepress', user: env.DB_USER || 'postgres', password: env.DB_PASSWORD || '' },
  jobsDir: env.JOBS_DIR || '/data/jobs',
  // Optional: if set, the first account needs it. Without it the first
  // person to reach the login page becomes admin (Will's usual bootstrap).
  bootstrapToken: env.BOOTSTRAP_TOKEN || '',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : env.NODE_ENV === 'production',
  allowPrivateUrls: env.ALLOW_PRIVATE_URLS === '1',
  drydock: { baseUrl: (env.DRYDOCK_BASE_URL || '').replace(/\/$/, ''), apiKey: env.DRYDOCK_API_KEY || '', pool: env.DRYDOCK_POOL ?? 'coder' },
  brewBucket: { configured: Boolean(env.BREW_BUCKET_URL && env.BREW_BUCKET_KEY), bucket: env.BREW_BUCKET_ARTIFACTS || 'artifacts' },
};
