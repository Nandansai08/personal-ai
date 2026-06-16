# MIT License — personal-ai
# Multi-stage: build TypeScript in a builder, ship only dist + bin + config.

FROM node:22-alpine AS builder
WORKDIR /app

# Install build toolchain for better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json eslint.config.js ./
COPY src ./src
COPY bin ./bin
COPY config ./config
RUN npm run build

# ── Runtime image ──────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/config ./config
COPY plugins ./plugins
COPY .env.example ./

# Persist config + memory + sessions outside the image
VOLUME ["/root/.personal-ai"]

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# tini handles SIGINT cleanly so SQLite WAL files don't get orphaned
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/web.js"]
