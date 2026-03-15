# Сборка фронтенда
FROM node:20-alpine AS client-builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Финальный образ: бэкенд + статика фронта
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
# Путь в index.js: join(__dirname, '..', '..', 'client', 'dist') = /client/dist
COPY --from=client-builder /build/dist /client/dist

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
