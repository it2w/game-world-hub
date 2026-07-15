import { defineConfig, devices } from "@playwright/test";

/**
 * Base URL: the testing subagent navigates via the Replit proxy, so we use
 * localhost:80 (the shared proxy entry point) as the base. Individual test
 * files can also read REPLIT_DEV_DOMAIN if they need full URLs for API calls.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // LFG tests share DB state; run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 45_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Headless by default; set PWDEBUG=1 to watch the browser.
    headless: true,
    // The Replit proxy uses mTLS; bypass certificate errors in dev.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the system Chromium installed via Nix — the bundled Playwright
        // binary requires libgbm which is not available in this environment.
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        },
      },
    },
  ],
});
