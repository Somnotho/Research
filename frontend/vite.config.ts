import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({ root: resolve('frontend'), build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } } });
