import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './web/e2e',
  outputDir: '.local/ui-results',
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
});
