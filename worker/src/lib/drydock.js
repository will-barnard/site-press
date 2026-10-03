// dry-dock /api/v1/generate client, with the behaviour the API's contract
// asks of callers (DRYDOCK-API.md + the dry-dock skill):
//   401/422  config or caller bug → fail loudly, never retry
//   503      no worker in the pool (MacBook asleep) → drop the pool pin once
//   504      worker too slow → the caller should shorten the prompt, not wait longer
//   502      worker error → retry once
// `pool` picks a machine, not a behaviour: generate is plain chat, so every
// bit of structure comes from our system prompt and our validation.

export class DryDockError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}

export class DryDock {
  constructor({ baseUrl, apiKey, pool, model, fallbackUnpinned = true, timeout = 120, log = console }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.pool = pool || undefined;
    this.model = model;
    this.fallbackUnpinned = fallbackUnpinned;
    this.timeout = timeout;
    this.log = log;
    this.down = false; // circuit breaker: once the fleet is unreachable, stop asking for the rest of the job
    this.stats = { calls: 0, ok: 0, failed: 0, fallbacks: 0, ms: 0, workers: {} };
  }

  get enabled() { return Boolean(this.baseUrl && this.apiKey) && !this.down; }

  async health() {
    if (!this.baseUrl || !this.apiKey) return { ok: false, reason: 'DRYDOCK_BASE_URL / DRYDOCK_API_KEY not set' };
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/generate/health`, { headers: { 'x-api-key': this.apiKey }, signal: AbortSignal.timeout(10000) });
      // Note: this is auth + liveness only. It answers ok with zero workers
      // online, so it is not a readiness gate.
      return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
    } catch (err) { return { ok: false, reason: err.message }; }
  }

  async #post(body) {
    const res = await fetch(`${this.baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((this.timeout + 30) * 1000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* error bodies may be plain text */ }
    return { status: res.status, data, text };
  }

  async generate({ system, prompt, messages }) {
    if (!this.enabled) throw new DryDockError('unavailable', 'dry-dock is not configured or was marked down for this job');
    const body = { system, prompt, messages, pool: this.pool, model: this.model, timeout: this.timeout };
    this.stats.calls++;
    const t0 = Date.now();
    let r;
    try { r = await this.#post(body); } catch (err) {
      this.stats.failed++;
      throw new DryDockError('unavailable', `dry-dock unreachable: ${err.message}`);
    }
    if (r.status === 503 && body.pool && this.fallbackUnpinned) {
      this.log.warn(`dry-dock: no worker in pool "${body.pool}" (asleep?) — retrying this call unpinned`);
      this.stats.fallbacks++;
      r = await this.#post({ ...body, pool: undefined });
    }
    if (r.status === 502) r = await this.#post(body);
    this.stats.ms += Date.now() - t0;
    if (r.status === 200 && r.data) {
      this.stats.ok++;
      // `worker` and `pool` are the truthful fields; `model` only echoes what we asked for.
      const k = `${r.data.worker} (${r.data.pool})`;
      this.stats.workers[k] = (this.stats.workers[k] || 0) + 1;
      return r.data;
    }
    this.stats.failed++;
    const detail = (r.data && (r.data.detail || r.data.error)) || r.text.slice(0, 200);
    if (r.status === 401) { this.down = true; throw new DryDockError('config', `dry-dock rejected the API key (401). Check DRYDOCK_API_KEY.`, 401); }
    if (r.status === 422) throw new DryDockError('caller', `dry-dock 422: ${detail}`, 422);
    if (r.status === 503) { this.down = true; throw new DryDockError('unavailable', `dry-dock has no worker online (503): ${detail}`, 503); }
    if (r.status === 504) throw new DryDockError('timeout', 'dry-dock worker timed out (504)', 504);
    throw new DryDockError('worker', `dry-dock ${r.status}: ${detail}`, r.status);
  }

  // Ask for JSON, check it, and give the model one chance to fix its answer.
  // `check(obj)` returns a list of problems (empty = good).
  async json({ system, prompt, check, shorten }) {
    let messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    let lastErrors = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      let out;
      try {
        out = await this.generate({ messages });
      } catch (err) {
        if (err.kind === 'timeout' && shorten && attempt === 1) {
          this.log.warn('dry-dock timed out; retrying with a shorter prompt');
          messages = [{ role: 'system', content: system }, { role: 'user', content: shorten(prompt) }];
          continue;
        }
        throw err;
      }
      const parsed = parseJsonLoose(out.content);
      const errors = parsed.ok ? check(parsed.value) : [`not valid JSON: ${parsed.error}`];
      if (!errors.length) return { value: parsed.value, worker: out.worker, pool: out.pool, attempts: attempt };
      lastErrors = errors;
      messages = [...messages, { role: 'assistant', content: out.content }, {
        role: 'user',
        content: `That answer has problems:\n- ${errors.slice(0, 8).join('\n- ')}\nReply with ONLY the corrected JSON object, nothing else.`,
      }];
    }
    throw new DryDockError('invalid', `model output failed validation twice: ${lastErrors.slice(0, 3).join('; ')}`);
  }
}

// Local models often wrap JSON in prose or ``` fences; take the outermost object.
export function parseJsonLoose(text) {
  const s = String(text || '').replace(/^\s+/, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object found' };
  try { return { ok: true, value: JSON.parse(body.slice(start, end + 1)) }; } catch (err) { return { ok: false, error: err.message }; }
}
