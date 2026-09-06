import { defineConfig } from '@playwright/test'

// Serve the same relative-base production build at real, case-sensitive mounts.
const pagesPreviews = [
  { name: 'pages-project-chromium', port: 4174, pathname: '/concept-grove/' },
  { name: 'pages-nested-chromium', port: 4175, pathname: '/GithubPages/concept-grove/' },
] as const

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: '**/app.spec.ts',
      use: {
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: '**/app.spec.ts',
      use: {
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    ...pagesPreviews.map(({ name, port, pathname }) => ({
      name,
      testMatch: '**/pages.spec.ts',
      use: {
        baseURL: `http://127.0.0.1:${port}${pathname}`,
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    })),
  ],
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    ...pagesPreviews.map(({ port, pathname }) => ({
      // --base mounts dist; it does not rebuild or change its relative asset URLs.
      command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort --base ${pathname}`,
      url: `http://127.0.0.1:${port}${pathname}`,
      // A stale server with a different base must not make this regression pass.
      reuseExistingServer: false,
      timeout: 30_000,
    })),
  ],
})