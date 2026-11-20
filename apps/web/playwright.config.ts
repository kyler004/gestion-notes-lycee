import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium = ['/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) =>
  existsSync(p),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    launchOptions: systemChromium ? { executablePath: systemChromium } : undefined,
  },
  webServer: {
    command: 'pnpm exec tsx e2e/test-server.ts',
    url: 'http://127.0.0.1:4174/health',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
