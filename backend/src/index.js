import express from 'express';
import { config } from './config.js';
import { migrate, waitForDb, query } from './db.js';
import { csrf } from './auth.js';
import { authRouter } from './routes/auth.js';
import { jobsRouter } from './routes/jobs.js';
import { systemRouter } from './routes/system.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
// Every route here takes small JSON bodies, so a global parser is fine in
// this service (no uploads; downloads stream out, nothing streams in).
app.use('/api', express.json({ limit: '64kb' }), csrf);
app.use('/api', authRouter, jobsRouter, systemRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

await waitForDb();
await migrate();
setInterval(() => query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {}), 6 * 3600e3).unref();
app.listen(config.port, () => console.log(`[backend] listening on :${config.port}`));
