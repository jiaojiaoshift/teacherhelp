# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run branding:icons
RUN npm run deploy:build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TEACHHELPER_DATA_ROOT=/data

RUN groupadd --system --gid 1001 teachhelper \
  && useradd --system --uid 1001 --gid teachhelper --home-dir /home/teachhelper teachhelper \
  && mkdir -p /data \
  && chown -R teachhelper:teachhelper /data /home/teachhelper

COPY --from=builder --chown=teachhelper:teachhelper /app/.next/standalone ./

USER teachhelper
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
