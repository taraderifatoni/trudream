FROM node:20-slim AS base

# System deps: ffmpeg (video processing) + python3/pip for yt-dlp. No chromium —
# the app has no puppeteer/headless-browser code. Debian (glibc) base avoids the
# Alpine/musl crash during Next.js "Collecting build traces".
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=2048
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Fonts for the slide compositor (@napi-rs/canvas registers these at runtime)
COPY --from=builder /app/fonts ./fonts
# @napi-rs/canvas native binary (+ its platform pkg) is not traced into
# .next/standalone — bring the whole scope in
COPY --from=builder /app/node_modules/@napi-rs ./node_modules/@napi-rs
RUN mkdir -p /app/tmp /app/data && chown nextjs:nodejs /app/tmp /app/data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
