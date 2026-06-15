# Can I Eat — 멀티스테이지. web(Vite/React) 빌드 → node 백엔드가 dist 서빙.
# 백엔드는 AI 호출에 claude CLI(Claude Code)를 subprocess 로 쓰므로 런타임 이미지에 설치한다.
# (CLI 호환을 위해 alpine 대신 debian slim 사용)

# 1) 프론트 빌드
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# 2) 백엔드 런타임
FROM node:20-slim
WORKDIR /app
RUN npm install -g @anthropic-ai/claude-code
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY db ./db
COPY --from=web /web/dist ./web/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
