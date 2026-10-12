import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: 'apps/web', plugins: [vue()], server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } }, build: { outDir: '../../dist/web', emptyOutDir: true } });
