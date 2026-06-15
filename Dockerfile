# Can I Eat — 독립 실행 이미지. 소스/의존성을 굽고 node로 직접 실행.
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 네이티브 빌드에 필요한 도구 (빌드 후 정리)
COPY package.json package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm install --omit=dev \
 && apk del .build-deps

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV CIE_DB_PATH=/app/data/cie.db

EXPOSE 3000

CMD ["node", "src/server.js"]
