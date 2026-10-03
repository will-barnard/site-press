# Built from the repo root (context: .) because the worker ships the template.
# Playwright's image carries Chromium and its system libraries; the tag must
# match the playwright version pinned in worker/package.json exactly.
FROM mcr.microsoft.com/playwright:v1.56.0-noble

# Every template dependency, dev deps included, so verify can `vite build` a
# generated site without network access at job time.
COPY template/package.json /opt/template-deps/package.json
RUN cd /opt/template-deps && sed -i 's/__SITE_SLUG__/template/' package.json && npm install --no-audit --no-fund

WORKDIR /app/worker
COPY worker/package.json ./
RUN npm install --no-audit --no-fund
COPY template /app/template
COPY worker/src ./src

ENV NODE_ENV=production \
    TEMPLATE_DIR=/app/template \
    TEMPLATE_DEPS_DIR=/opt/template-deps/node_modules \
    JOBS_DIR=/data/jobs
CMD ["node", "src/index.js"]
