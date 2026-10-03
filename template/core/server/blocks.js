import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.js';
import { validateProps, validateStyle, validateVariant } from '../shared/schema.js';
import { sanitizeProps } from './sanitize.js';

// Server-side registry of block schemas, mirroring core/client/blocks.js:
// library blocks first, site blocks override by name.
let registry = null;

async function scan(dir, into, source) {
  let names = [];
  try { names = await fs.readdir(dir); } catch { return; }
  for (const name of names) {
    const file = path.join(dir, name, 'schema.js');
    try {
      await fs.access(file);
      into[name] = { schema: (await import(pathToFileURL(file).href)).default, source };
    } catch { /* not a block folder */ }
  }
}

export async function loadBlocks() {
  if (registry) return registry;
  const out = {};
  await scan(path.join(ROOT, 'core/blocks'), out, 'library');
  await scan(path.join(ROOT, 'site/blocks'), out, 'site');
  registry = out;
  return registry;
}

// Validate + sanitise one block for storage. Returns { block, errors }.
export async function cleanBlock(input, where = 'block') {
  const reg = await loadBlocks();
  const def = reg[input.type];
  if (!def) return { block: null, errors: [`${where}: unknown block type "${input.type}"`] };
  const { value, errors } = validateProps(def.schema, input.props || {});
  const style = validateStyle(input.props?._style || {});
  sanitizeProps(def.schema.fields, value);
  if (Object.keys(style.value).length) value._style = style.value;
  return {
    block: { id: input.id, type: input.type, variant: validateVariant(def.schema, input.variant), props: value },
    errors: [...errors, ...style.errors].map((e) => `${where}: ${e}`),
  };
}
