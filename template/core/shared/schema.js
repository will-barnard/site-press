// Block schema helpers, shared by three consumers that must agree exactly:
//   - the generated site's API (validates every save from the admin),
//   - the generated site's admin (builds editing forms from the same schema),
//   - the site-press worker (validates what the mapper or dry-dock produced
//     before it is ever written into seed.json).
// Keep this file dependency-free and isomorphic (no node: imports, no DOM).

export const FIELD_TYPES = [
  'text', 'textarea', 'richtext', 'media', 'link', 'select', 'boolean', 'number', 'color', 'list',
];

// Every block also carries a `_style` object that is NOT part of its schema.
// It holds per-section presentation captured from the original site (a
// Squarespace "section theme" is mostly a background colour) and is edited by
// one generic "Section style" panel in the admin rather than per block.
export const STYLE_FIELDS = {
  bg: { type: 'color', label: 'Background colour' },
  color: { type: 'color', label: 'Text colour' },
  bgImage: { type: 'media', label: 'Background image' },
  overlay: { type: 'number', label: 'Image overlay (0-1)', min: 0, max: 1 },
  padY: { type: 'number', label: 'Vertical padding (px)', min: 0, max: 400 },
  align: { type: 'select', label: 'Text alignment', options: ['left', 'center', 'right'] },
};

function emptyFor(field) {
  if ('default' in field) return structuredClone(field.default);
  switch (field.type) {
    case 'boolean': return false;
    case 'number': return null;
    case 'media': return null;
    case 'link': return { label: '', href: '' };
    case 'list': return [];
    case 'select': return field.options?.[0] ?? '';
    default: return '';
  }
}

export function defaults(schema) {
  const out = {};
  for (const [name, field] of Object.entries(schema.fields || {})) out[name] = emptyFor(field);
  return out;
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Media values are stored inline ({src, alt, width, height}) rather than as a
// foreign key: a page renders from one JSON document with no joins, and a
// deleted media row never breaks a published page.
function coerceMedia(v, path, errors) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return { src: v, alt: '' };
  if (!isObj(v) || typeof v.src !== 'string' || !v.src) {
    errors.push(`${path}: media needs a src`);
    return null;
  }
  const out = { src: v.src, alt: typeof v.alt === 'string' ? v.alt : '' };
  if (Number.isFinite(v.width)) out.width = v.width;
  if (Number.isFinite(v.height)) out.height = v.height;
  return out;
}

function coerceField(field, v, path, errors) {
  if (v === undefined) return emptyFor(field);
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'color':
      if (v == null) return '';
      if (typeof v !== 'string') { errors.push(`${path}: expected a string`); return String(v); }
      if (field.maxLength && v.length > field.maxLength) errors.push(`${path}: longer than ${field.maxLength}`);
      return v;
    case 'boolean':
      return Boolean(v);
    case 'number': {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) { errors.push(`${path}: expected a number`); return null; }
      if (field.min != null && n < field.min) errors.push(`${path}: below ${field.min}`);
      if (field.max != null && n > field.max) errors.push(`${path}: above ${field.max}`);
      return n;
    }
    case 'select':
      if (!field.options.includes(v)) { errors.push(`${path}: must be one of ${field.options.join(', ')}`); return field.options[0]; }
      return v;
    case 'media':
      return coerceMedia(v, path, errors);
    case 'link': {
      if (v == null) return { label: '', href: '' };
      if (typeof v === 'string') return { label: '', href: v };
      if (!isObj(v)) { errors.push(`${path}: link must be {label, href}`); return { label: '', href: '' }; }
      return { label: String(v.label ?? ''), href: String(v.href ?? '') };
    }
    case 'list': {
      if (v == null) return [];
      if (!Array.isArray(v)) { errors.push(`${path}: expected a list`); return []; }
      if (field.max && v.length > field.max) errors.push(`${path}: more than ${field.max} items`);
      return v.map((item, i) => coerceObject(field.fields, item, `${path}[${i}]`, errors));
    }
    default:
      errors.push(`${path}: unknown field type ${field.type}`);
      return v;
  }
}

function coerceObject(fields, value, path, errors) {
  const src = isObj(value) ? value : {};
  if (!isObj(value) && value != null) errors.push(`${path || 'props'}: expected an object`);
  const out = {};
  for (const [name, field] of Object.entries(fields || {})) {
    const p = path ? `${path}.${name}` : name;
    out[name] = coerceField(field, src[name], p, errors);
    if (field.required && (out[name] === '' || out[name] == null)) errors.push(`${p}: required`);
  }
  // Unknown keys are dropped on purpose. A model that invents `subtitle2`
  // must not be able to smuggle data the admin can never show or edit.
  return out;
}

// Returns { ok, errors, value }. `value` is always usable (coerced, unknown
// keys stripped) so a caller can choose to accept a partially-wrong result.
export function validateProps(schema, props) {
  const errors = [];
  const value = coerceObject(schema.fields, props, '', errors);
  return { ok: errors.length === 0, errors, value };
}

export function validateStyle(style) {
  const errors = [];
  // Only keys actually set are coerced: an unset `align` must stay unset
  // (inherit), not become the select's first option.
  const src = isObj(style) ? style : {};
  const value = {};
  for (const [k, field] of Object.entries(STYLE_FIELDS)) {
    if (src[k] === undefined || src[k] === null || src[k] === '') continue;
    value[k] = coerceField(field, src[k], `_style.${k}`, errors);
  }
  return { ok: errors.length === 0, errors, value };
}

export function validateVariant(schema, variant) {
  const variants = schema.variants || ['default'];
  return variants.includes(variant) ? variant : variants[0];
}

// A compact, model-readable description of a block's fields. Sent to dry-dock
// inside the system prompt, so it is deliberately terse: a local model with a
// 32k window should spend its tokens on the section, not on our schema.
export function describeFields(fields, indent = '') {
  const lines = [];
  for (const [name, f] of Object.entries(fields || {})) {
    let t = f.type;
    if (f.type === 'select') t = `one of ${f.options.map((o) => JSON.stringify(o)).join('|')}`;
    if (f.type === 'media') t = 'image id like "img_3" or null';
    if (f.type === 'link') t = '{label, href}';
    if (f.type === 'richtext') t = 'html string (p, strong, em, a, ul, ol, li, h3, h4 only)';
    lines.push(`${indent}${name}: ${t}${f.required ? ' (required)' : ''}${f.hint ? ` — ${f.hint}` : ''}`);
    if (f.type === 'list') lines.push(...describeFields(f.fields, `${indent}  `).map((l) => `${l}`));
  }
  return lines;
}

export function describeSchema(schema) {
  const variants = (schema.variants || ['default']).join('|');
  return [`${schema.type} (variants: ${variants}) — ${schema.description || ''}`, ...describeFields(schema.fields, '  ')].join('\n');
}

// Walk props and call fn(mediaValue, setter) for every media field, including
// those nested in lists. Used to rewrite image references during seeding.
export function walkMedia(fields, props, fn) {
  for (const [name, f] of Object.entries(fields || {})) {
    if (!props) continue;
    if (f.type === 'media' && props[name]) fn(props[name], (v) => { props[name] = v; });
    if (f.type === 'list' && Array.isArray(props[name])) for (const item of props[name]) walkMedia(f.fields, item, fn);
  }
}

// Collect every human-visible string in a block's props. The verifier uses
// this to compute text coverage against the original page.
export function collectText(fields, props, out = []) {
  for (const [name, f] of Object.entries(fields || {})) {
    const v = props?.[name];
    if (v == null) continue;
    if (['text', 'textarea', 'richtext'].includes(f.type) && typeof v === 'string') out.push(v);
    if (f.type === 'link' && v.label) out.push(v.label);
    if (f.type === 'media' && v.alt) out.push(v.alt);
    if (f.type === 'list' && Array.isArray(v)) for (const item of v) collectText(f.fields, item, out);
  }
  return out;
}
