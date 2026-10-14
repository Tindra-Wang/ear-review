import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const chromeInstalled = process.platform === 'win32' && existsSync(resolve(process.env.PROGRAMFILES ?? 'C:/Program Files','Google/Chrome/Application/chrome.exe'));
export default defineConfig({
  testDir: './tests/e2e', timeout: 30_000, workers: 1, fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'output/playwright/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3002', browserName: 'chromium', channel: chromeInstalled ? 'chrome' : undefined, headless: true, viewport: { width: 1366, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3002/api/health', timeout: 30_000, reuseExistingServer: false, env: { PORT: '3002', ADMIN_PASSWORD: 'EarReview-Test-Only!', DATA_DIR: resolve(`output/playwright/runtime-${Date.now()}`), OLLAMA_URL: 'http://127.0.0.1:65530' } }
});
