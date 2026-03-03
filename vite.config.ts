import path from 'path';
import { defineConfig } from 'vite'; // loadEnv 제거

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [],
  // define 부분 통째로 삭제 (이제 사용자가 직접 입력하므로 필요 없음)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});