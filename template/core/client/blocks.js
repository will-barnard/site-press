// Block registry. Library blocks live in core/blocks (vendored, upgraded by
// site-press); site-specific blocks generated for this client live in
// site/blocks and win on a name clash, so a client can override a library
// block without forking core.
//
// Eager globs on purpose: a lazy glob splits each block's scoped CSS into its
// own chunk, and a server-rendered page would paint unstyled until those load.
const libComponents = import.meta.glob('../blocks/*/index.vue', { eager: true });
const libSchemas = import.meta.glob('../blocks/*/schema.js', { eager: true });
const siteComponents = import.meta.glob('../../site/blocks/*/index.vue', { eager: true });
const siteSchemas = import.meta.glob('../../site/blocks/*/schema.js', { eager: true });

function nameOf(path) { return path.split('/').at(-2); }

function collect(components, schemas, source, into) {
  for (const [path, mod] of Object.entries(components)) {
    const name = nameOf(path);
    const schemaPath = path.replace('index.vue', 'schema.js');
    const schema = schemas[schemaPath]?.default;
    if (!schema) continue; // a component without a schema can't be edited, so it can't be placed
    into[name] = { component: mod.default, schema, source };
  }
}

export const blocks = {};
collect(libComponents, libSchemas, 'library', blocks);
collect(siteComponents, siteSchemas, 'site', blocks);

export function blockFor(type) {
  return blocks[type] || blocks.placeholder;
}
