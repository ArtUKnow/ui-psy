import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'go-migration.spec.ts', workers: 1, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: 'server-go/reports/browser-results.json' }]],
  outputDir: 'server-go/reports/browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:8518', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure', storageState: { cookies: [], origins: [] } },
  projects: [
    { name: 'chromium-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'firefox-mobile', use: { browserName: 'firefox', viewport: { width: 390, height: 844 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 } } },
  ],
});
