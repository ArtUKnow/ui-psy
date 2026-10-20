import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5188',
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:5188', localStorage: [{ name: 'ui-psy-guest', value: 'yes' }] }] },
  },
  webServer: {
    // Dedicated PostgreSQL database, recreated per run; never point this at ui_psy.
    command: 'dropdb --if-exists -h /tmp ui_psy_playwright && createdb -h /tmp ui_psy_playwright && npm run dev -- --host 0.0.0.0 --port 5188',
    url: 'http://127.0.0.1:5188',
    env: {
      DATABASE_URL: 'postgres:///ui_psy_playwright?host=/tmp',
      GIGACHAT_CREDENTIALS: '',
      UI_PSY_LOG_PATH: join(tmpdir(), `ui-psy-playwright-${process.pid}.jsonl`),
      UI_PSY_BACKUP_DIR: join(tmpdir(), `ui-psy-playwright-backups-${process.pid}`),
      UI_PSY_BACKUP_INTERVAL: '1h',
    },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
