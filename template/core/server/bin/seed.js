#!/usr/bin/env node
// npm run seed                 import site/seed.json into an empty database
// npm run seed -- --replace    wipe pages + redirects and import fresh
//                              (users, media rows and form submissions are kept)
import { migrate, waitForDb, getPool } from '../db.js';
import { importSeed, hasContent } from '../seed.js';

const replace = process.argv.includes('--replace');
try {
  await waitForDb();
  await migrate();
  if (!replace && (await hasContent())) {
    console.error('[seed] the database already has pages. Use --replace to overwrite them.');
    process.exitCode = 1;
  } else {
    await importSeed({ replace });
  }
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
