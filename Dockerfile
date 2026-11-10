# ---------- Stage 1: install dependency produksi ----------
FROM node:22-alpine AS deps
WORKDIR /app

# toolchain cadangan jika bcrypt perlu di-compile (tidak ikut ke image akhir)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: runtime ----------
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    APP_PORT=9060 \
    TZ=Asia/Jakarta

RUN apk add --no-cache tzdata

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

RUN mkdir -p storage && chown node:node storage

USER node
EXPOSE 9060

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9060/health > /dev/null || exit 1

CMD ["node", "src/server.js"]
