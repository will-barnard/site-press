# Multi-stage: build the client + SSR bundles, then ship only runtime deps.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY core ./core
COPY site ./site
EXPOSE 3000
CMD ["node", "core/server/index.js"]
