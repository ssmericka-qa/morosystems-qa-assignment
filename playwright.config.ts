import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Location of the MoroSystems todo backend (https://github.com/morosystems/todo-be).
 * Defaults to ./todo-be (git-ignored); override with TODO_BE_DIR.
 */
const TODO_BE_DIR = resolve(process.env.TODO_BE_DIR ?? 'todo-be');
const API_URL = process.env.API_URL ?? 'http://localhost:8080';
const isCI = !!process.env.CI;

export default defineConfig({
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // GUI tests hit the live production website – keep parallelism polite.
  workers: isCI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // CI: each job writes a blob report; the "report" job merges them into one HTML report.
  // The github reporter shows failures as annotations directly in the code view.
  // Allure results are written everywhere – `npm run report:allure` builds the Allure report.
  reporter: isCI
    ? [['list'], ['github'], ['blob'], ['allure-playwright']]
    : [
        ['list'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['allure-playwright'],
      ],

  use: {
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    // SLOWMO=500 slows every action down – handy for watching a headed run.
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  // Start the backend for API tests when its sources are available (locally ./todo-be, in CI
  // only the api job checks it out); reuse it if already running. Without it, API tests expect
  // the backend on API_URL.
  webServer: existsSync(TODO_BE_DIR)
    ? {
        command: 'npm start',
        cwd: TODO_BE_DIR,
        url: `${API_URL}/tasks/completed`,
        reuseExistingServer: !isCI,
        timeout: 60_000,
      }
    : undefined,

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: API_URL },
    },

    // Cross-browser GUI tests. PW_CHANNEL=chrome | msedge runs this project in the branded
    // Chrome or Edge (installed on the machine) instead of the bundled Chromium.
    {
      name: 'chromium',
      testDir: './tests/gui',
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL },
    },
    { name: 'firefox', testDir: './tests/gui', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/gui', use: { ...devices['Desktop Safari'] } },

    // Responsive checks on mobile and tablet viewports
    { name: 'mobile', testDir: './tests/responsive', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', testDir: './tests/responsive', use: { ...devices['iPad (gen 7)'] } },

    // Visual regression against committed baselines (one engine keeps them stable)
    { name: 'visual', testDir: './tests/visual', use: { ...devices['Desktop Chrome'] } },
  ],
});
