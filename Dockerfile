# Can I Eat — 멀티스테이지. web(Vite/React) 빌드 → node 백엔드가 dist 서빙.

# 1) 프론트 빌드
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# 2) 백엔드 런타임
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY db ./db
COPY --from=web /web/dist ./web/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
