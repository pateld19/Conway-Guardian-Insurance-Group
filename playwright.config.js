// CheckEverythingWorks agent: Playwright configuration.
//
// Local run (starts a small web server for index.html):
//   npm run check
// Check a live site instead, e.g. the Cloudflare deployment:
//   SITE_URL=https://conway-guardian-insurance-group.example.workers.dev npm run check

const { defineConfig, devices } = require("@playwright/test");

const SITE_URL = process.env.SITE_URL;
const PORT = 4173;
const chromePath = process.env.CHROME_PATH; // optional: use an installed Chrome instead of Playwright's

const launchOptions = chromePath ? { executablePath: chromePath } : {};

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: SITE_URL || `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: SITE_URL
    ? undefined
    : {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: "ignore",
        stderr: "ignore",
      },
});
