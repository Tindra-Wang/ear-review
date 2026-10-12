import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { root: '.', include: ['packages/**/*.test.ts','apps/api/**/*.test.ts'], environment: 'node' } });
