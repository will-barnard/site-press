import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    // `npm run dev` serves the client here and sends API + media calls to
    // `npm run dev:server` on :3000.
    proxy: { '/api': 'http://localhost:3000', '/media': 'http://localhost:3000' },
  },
});
