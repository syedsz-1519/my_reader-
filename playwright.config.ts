import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const preinstalledShell = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
const launchOptions = fs.existsSync(preinstalledShell)
  ? { executablePath: preinstalledShell }
  : undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1280, height: 800 },
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    { name: 'galaxy-fold', use: { viewport: { width: 280, height: 653 }, hasTouch: true } },
    { name: 'iphone-se', use: { viewport: { width: 375, height: 667 }, hasTouch: true } },
    { name: 'iphone-14', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'pixel-7', use: { viewport: { width: 412, height: 915 }, hasTouch: true } },
    { name: 'landscape-phone', use: { viewport: { width: 667, height: 375 }, hasTouch: true } },
    { name: 'ipad', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, hasTouch: false } },
  ],
});
