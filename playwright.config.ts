import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['PLAYWRIGHT_PORT'] ?? '3001');
const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${port}`;
const devCommand =
  process.platform === 'win32'
    ? `npm.cmd run dev -- --hostname 127.0.0.1 --port ${port}`
    : `npm run dev -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['html'], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: devCommand,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      NEXT_PUBLIC_E2E_BYPASS_TURNSTILE: '1',
      E2E_AUTH_SESSIONS: '1',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ??
        'playwright-placeholder-anon-key-not-for-production',
      E2E_BLOG_FIXTURE: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
