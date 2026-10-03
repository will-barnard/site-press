import express from 'express';
import { query } from '../db.js';
import { content } from '../content/index.js';
import { rateLimit } from '../auth.js';

// Contact-form submissions are stored and listed in the admin.
//
// NOT BUILT YET: email notification. Sending needs an SMTP or transactional
// mail provider per client and a FORM_NOTIFY_EMAIL setting; until that lands,
// submissions are only visible in the admin under "Form submissions".
export const formsRouter = express.Router();

const limiter = rateLimit({ windowMs: 10 * 60e3, max: 5 });

formsRouter.post('/api/forms/:blockId', express.json({ limit: '64kb' }), limiter, async (req, res, next) => {
  try {
    const block = await content.getFormBlock(Number(req.params.blockId));
    if (!block || block.type !== 'contact-form') return res.status(404).json({ error: 'This form no longer exists.' });
    const { values = {}, _hp } = req.body || {};
    // Honeypot filled in: pretend it worked so the bot moves on.
    if (_hp) return res.json({ ok: true });
    const payload = {};
    for (const f of block.props.fields || []) {
      const v = String(values[f.name] ?? '').slice(0, 5000).trim();
      if (f.required && !v) return res.status(422).json({ error: `${f.label} is required.` });
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(422).json({ error: `${f.label} doesn't look like an email address.` });
      if (v) payload[f.label || f.name] = v;
    }
    if (!Object.keys(payload).length) return res.status(422).json({ error: 'The form is empty.' });
    await query('INSERT INTO form_submissions (block_id, page_path, payload) VALUES ($1, $2, $3)', [block.id, block.path, payload]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
