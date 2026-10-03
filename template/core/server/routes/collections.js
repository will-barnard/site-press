import express from 'express';

// NOT BUILT YET: collections (blog posts, events, team members).
// The tables exist (migrations/001_init.sql) so the shape is settled. What's
// missing: admin list/detail editors, a collection-list block, list + detail
// public routes, RSS, and site-press importing Squarespace blog collections
// from ?format=json. Until then these return 501 rather than an empty list
// that looks like "no posts".
export const collectionsRouter = express.Router();

collectionsRouter.all(['/api/collections', '/api/collections/*', '/api/admin/collections', '/api/admin/collections/*'], (req, res) => {
  res.status(501).json({ error: 'Collections are not built yet.' });
});
