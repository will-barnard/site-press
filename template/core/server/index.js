import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { migrate, waitForDb } from './db.js';
import { purgeExpiredSessions } from './auth.js';
import { publicRouter } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { formsRouter } from './routes/forms.js';
import { collectionsRouter } from './routes/collections.js';
import { createRenderer } from './ssr.js';
import { importSeed, hasContent } from './seed.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Beachhead's nginx-proxy: req.ip / req.protocol from X-Forwarded-*

// Process-only health check: Beachhead polls it during a deploy, and one that
// queried the database would turn a slow query into a failed deploy.
app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

// No global body parser: the media upload route streams its body, so each
// router mounts express.json() only where it needs it.
app.use(publicRouter);
app.use(authRouter);
app.use(collectionsRouter);
app.use(adminRouter);
app.use(formsRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use('/assets', express.static(path.join(config.distDir, 'client/assets'), { immutable: true, maxAge: '1y', index: false }));
app.use(express.static(path.join(config.distDir, 'client'), { index: false, maxAge: '1h' }));
app.get('*', await createRenderer());

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: status >= 500 && !err.config ? 'Something went wrong on the server.' : err.message, details: err.details });
});

async function boot() {
  if (!config.preview) {
    await waitForDb();
    await migrate();
    if (config.seedOnBoot && !(await hasContent())) await importSeed();
    await purgeExpiredSessions().catch(() => {});
    setInterval(() => purgeExpiredSessions().catch(() => {}), 6 * 3600e3).unref();
  }
  const server = app.listen(config.port, () => console.log(`[site] listening on :${config.port}${config.preview ? ' (preview: serving site/seed.json, admin disabled)' : ''}`));
  // Large media uploads outlive Node's default 5-minute request timeout.
  server.requestTimeout = 0;
  server.headersTimeout = 60e3;
}

boot().catch((err) => { console.error('[site] failed to start:', err); process.exit(1); });
