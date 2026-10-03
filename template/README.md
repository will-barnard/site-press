# __SITE_SLUG__

Rebuilt by [site-press](https://github.com/will-barnard) from __SOURCE_URL__. One Node service (server-rendered Vue 3 + Express) plus Postgres, with a small admin at `/admin` for editing page content.

## Layout

```
core/          vendored lite CMS — don't edit; upgrade by re-copying from site-press
  server/        Express: SSR, admin API, auth, media, forms, seed import
  client/        Vue: public renderer + /admin (client-only, lazy-loaded)
  blocks/        block library (component + schema each)
  shared/        schema validation shared by server, admin and site-press
site/          this site's own files — edit freely
  theme.css      design tokens captured from the original site
  blocks/        custom blocks generated for this site (x-*)
  seed.json      content imported on first boot
  seed-media/    images imported on first boot
site-press.json  where this came from (source URL, core version, job id)
```

The admin edits content inside blocks: text, images, links, list items, a section's background. It doesn't edit page layout. A block's admin form is generated from its `schema.js`, so a new block needs no admin code.

## Run it locally

```bash
npm install
npm run preview:seed      # build + serve straight from site/seed.json, no database (admin disabled)
```

With a database:

```bash
DB_HOST=localhost DB_PASSWORD=… ADMIN_BOOTSTRAP_TOKEN=pick-one npm run build && npm start
# open /admin, enter the token, create the owner account
```

`npm run dev` (Vite, client only) + `npm run dev:server` (API on :3000) for working on blocks.

## Deploy on Beachhead

`beachhead.json` and `docker-compose.yml` are ready: `web` is public on port 3000, `postgres` is stateful, and both volumes have fixed names (`__SITE_SLUG__-postgres`, `__SITE_SLUG__-media`).

Global env vars (no Target Service), because compose reads them as `${VAR}`:

| Var | |
|---|---|
| `DB_PASSWORD` | required |
| `ADMIN_BOOTSTRAP_TOKEN` | needed once to create the owner at `/admin`; remove afterwards |
| `PUBLIC_URL` | `https://the-domain` — canonical tags, sitemap, og:image |
| `BREW_BUCKET_URL` / `BREW_BUCKET_KEY` | optional: store uploads in brew-bucket (`uploads/__SITE_SLUG__/…`) instead of the local volume |

On first boot the server applies migrations and imports `site/seed.json` if there are no pages yet.

## Refresh content before launch

Clients keep editing the old site while you build. Re-run site-press, copy the new `site/seed.json` and `site/seed-media/` over these, then:

```bash
npm run seed -- --replace   # wipes pages + redirects, keeps users, media rows and form submissions
```

## Not built yet

- **Email for form submissions.** They're saved and listed under *Form submissions* in the admin.
- **Collections** (blog posts, events). Tables exist; `/api/collections` returns 501. Imported posts are ordinary pages.
- **Password reset by email.** An owner can add or remove users with a temporary password.
- **Image resizing.** Images are served at their imported size, with width/height set to prevent layout shift.
