import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';

// The worker reads block schemas straight out of the template it ships, so
// the mapper, the validator and the generated admin can never disagree about
// what a block's props look like.
let cached = null;

export async function loadCatalog() {
  if (cached) return cached;
  const shared = await import(pathToFileURL(path.join(config.templateDir, 'core/shared/schema.js')).href);
  const dir = path.join(config.templateDir, 'core/blocks');
  const blocks = {};
  for (const name of (await fs.readdir(dir)).sort()) {
    const file = path.join(dir, name, 'schema.js');
    try { blocks[name] = (await import(pathToFileURL(file).href)).default; } catch { /* not a block */ }
  }
  const imageSize = await import(pathToFileURL(path.join(config.templateDir, 'core/server/media/image-size.js')).href);
  const version = (await fs.readFile(path.join(config.templateDir, 'core/VERSION'), 'utf8')).trim();
  cached = { blocks, shared, imageSize, version };
  return cached;
}
