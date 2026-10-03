# site-press

Give it a URL (Squarespace first, anything else on a best-effort path) and it rebuilds the site as a Vue 3 + Express + Postgres app with a lite admin for page content. The result is a ready-to-commit repo, plus a report comparing every section of the rebuild against the original.

It decompiles instead of copying. Each page becomes content (rows), a theme (CSS tokens) and blocks (Vue components from a fixed library). That's why the admin works on every site it produces.

## How a job runs

```
capture   Playwright crawls sitemap.xml + links; per page: DOM, computed styles,
          section screenshots at 1440/768/375 (+ Squarespace ?format=json)
analyze   fonts, colours, sizes, spacing, buttons, header/footer → site/theme.css
map       each section → a library block. Rules first; low-confidence sections
          go to dry-dock (coder pool). Every result is schema-validated and
          checked for dropped text before it's accepted.
generate  copy template/ (vendored core), download images, write seed.json
custom    sections nothing fits → dry-dock writes a site block (template + CSS
          only; our <script>). Compiled + checked, or it stays a placeholder.
verify    build the generated site, serve it from seed.json, capture it the
          same way, score each section: pixels + SSIM + height, text coverage,
          links. Fix loop: try other layout variants for failing sections.
report    report/index.html — original | rebuild | diff, worst sections first
package   <slug>-site.tar.gz + report → download, and brew-bucket artifacts
```

AI generates and the numbers judge. No model decides whether a rebuild is good: pass/fail is pixel and text measurement, and the report shows you why.

## Repo

```
backend/    Express API: auth (first account = admin), jobs, downloads, report
frontend/   Vue UI: submit a URL, watch the log, read the result
worker/     the pipeline (Playwright image); polls the jobs table, one job at a time
template/   the lite CMS every rebuild is made from — also usable by hand
```

## Deploy on Beachhead

`beachhead.json` declares `frontend` public on port 80 and `postgres` stateful. The volumes are `site-press-postgres` and `site-press-jobs`; the jobs volume holds captures, reports and archives and is shared by the backend and worker.

Global env vars (see `.env.example`):

| Var | |
|---|---|
| `DB_PASSWORD` | required |
| `DRYDOCK_BASE_URL`, `DRYDOCK_API_KEY` | dry-dock personal API |
| `DRYDOCK_POOL` | default `coder` (MacBook, qwen2.5-coder:32b) |
| `DRYDOCK_FALLBACK_UNPINNED` | default `1`: if coder has no worker, retry that call unpinned |
| `BREW_BUCKET_URL`, `BREW_BUCKET_KEY` | key scoped to write on `artifacts` |
| `BOOTSTRAP_TOKEN` | optional; required for the first account if set |
| `PASS_VISUAL`, `PASS_TEXT` | pass marks (0.72 / 0.97), uncalibrated |
| `ALLOW_PRIVATE_URLS` | `1` to rebuild LAN sites |

**Build platform.** The worker image is `mcr.microsoft.com/playwright:v1.56.0-noble`, which is multi-arch. Your build worker sets `BEACHHEAD_BUILD_PLATFORM=linux/amd64`, so on the arm64 Mac mini Chromium runs emulated. That works but it's slow, and Chromium under emulation can crash on heavy pages. If capture is flaky, build this one service natively for arm64.

## dry-dock notes

- `pool: coder` pins the MacBook. If it's asleep, each call gets a 503 and (with fallback on) re-runs unpinned on the Mac mini's pools. The report says which worker answered each call. If dry-dock is unreachable at job start, the job runs rules-only and says so.
- `/api/v1/generate` runs at the worker's `CHAT_TEMPERATURE` (0.7), not the structured-edit 0.15, and the API has no per-call temperature. The schema check plus one fix-it retry covers it, but a `temperature` field on generate would make site-press's JSON more reliable. That's worth adding to dry-dock.
- Calls go one section at a time, with stripped-down HTML (well under the coder's 32k context). A 504 retries once with a shorter prompt.
- No vision: the fleet has no image path, so dry-dock reads section HTML and geometry, not screenshots. Hence the variant search is deterministic and custom blocks aren't revised from visual diffs.

## Develop locally

```bash
cd template && npm install                              # also serves as TEMPLATE_DEPS_DIR
cd backend && npm install && DB_HOST=… node src/index.js
cd worker && npm install && TEMPLATE_DEPS_DIR=../template/node_modules DB_HOST=… node src/index.js
cd frontend && npm install && npm run dev               # proxies /api to :3001
```

The worker needs Chromium matching playwright 1.56.0 (`npx playwright install chromium`).

## Not built yet

- **Collections import.** Blog posts and events become ordinary pages, and the report flags it. The template has the tables; the editors, blocks and the `?format=json` collection import don't exist yet.
- **Form emails** in generated sites (submissions are stored in the admin).
- **Lighthouse / axe** in verify.
- **Custom-block revision from visual diffs.** That needs a vision path on dry-dock.
- **Adapters beyond Squarespace.** WordPress, Webflow and Wix go through the generic DOM path.
- **Core upgrade command.** For now, re-copy `template/core` into a generated site to upgrade it.
- **Tuned thresholds.** Run it on 2–3 sites you've already rebuilt by hand and set `PASS_VISUAL` / `PASS_TEXT` from those scores.
