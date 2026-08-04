import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname,
  testMatch: 'record.spec.ts',
  // Scenes share database state — 10 tampers the chain, 12 adds an SLA policy —
  // and they must be recorded in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.SW360_WEB ?? 'http://localhost:3000',
    // Headless is fine and slightly faster. Frames are captured in the renderer,
    // not off a display, so there is no visual difference.
    headless: true,
    launchOptions: {
      // Interactions read as human-paced rather than instantaneous.
      slowMo: 60,
      args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
      // Escape hatch for machines that already have a Chromium and should not
      // download another. Normally leave it unset.
      ...(process.env.SW360_CHROMIUM ? { executablePath: process.env.SW360_CHROMIUM } : {}),
    },
  },
});
