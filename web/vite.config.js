import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 빌드 산출물은 dist/ → cie Express(server.js)가 정적 서빙.
// dev 시 /api 는 로컬 백엔드(3000)로 프록시.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
