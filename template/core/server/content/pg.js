import { query } from '../db.js';

// Read side of the content model for the public site. Writes live in
// routes/admin.js because only the admin writes.

export async function getSite() {
  const { rows } = await query('SELECT data FROM site_settings WHERE id = 1');
  return rows[0]?.data || {};
}

export async function getPage(path, { includeDrafts = false } = {}) {
  const { rows } = await query(
    `SELECT id, path, title, seo, status FROM pages WHERE path = $1 ${includeDrafts ? '' : "AND status = 'published'"}`,
    [path],
  );
  const page = rows[0];
  if (!page) return null;
  const blocks = await query('SELECT id, type, variant, props FROM blocks WHERE page_id = $1 ORDER BY position', [page.id]);
  return { ...page, blocks: blocks.rows };
}

export async function listPublished() {
  const { rows } = await query("SELECT path, updated_at FROM pages WHERE status = 'published' ORDER BY path");
  return rows;
}

export async function getRedirect(path) {
  const { rows } = await query('SELECT to_path, status FROM redirects WHERE from_path = $1', [path]);
  return rows[0] || null;
}

export async function getFormBlock(id) {
  const { rows } = await query(
    `SELECT b.id, b.type, b.props, p.path FROM blocks b JOIN pages p ON p.id = b.page_id
      WHERE b.id = $1 AND p.status = 'published'`,
    [id],
  );
  return rows[0] || null;
}
