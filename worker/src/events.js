import { query } from './db.js';

// Job-scoped logger: every line lands in job_events (the UI tails it) and on
// stdout (docker logs). Writes never block the pipeline, but they are
// chained so lines keep their order (ids are assigned in insert order).
export function jobLogger(jobId) {
  let stage = 'queued';
  let chain = Promise.resolve();
  const write = (level, message, data) => {
    const line = `[job ${jobId.slice(0, 8)}] [${stage}] ${message}`;
    (level === 'error' ? console.error : console.log)(line);
    const args = [jobId, stage, level, message, data ?? null];
    chain = chain
      .then(() => query('INSERT INTO job_events (job_id, stage, level, message, data) VALUES ($1, $2, $3, $4, $5)', args))
      .catch((err) => console.error('[events] insert failed', err.message));
  };
  return {
    setStage(s) { stage = s; },
    get stage() { return stage; },
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
    flush: () => chain,
  };
}
