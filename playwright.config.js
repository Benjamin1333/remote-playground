// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * E2E-Konfiguration für MTG Collections.
 *
 * Wir testen gegen Chromium UND WebKit (Safaris Engine), weil reine
 * Chromium-Tests engine-spezifische Bugs durchrutschen lassen – z. B. das
 * Bottom-Sheet, das in Safari wegen `flex-basis: 0%` kollabierte, in
 * Chromium aber nicht. WebKit braucht auf manchen Systemen zusätzliche
 * Bibliotheken (`npx playwright install --with-deps webkit`); in CI ist das
 * Standard, lokal ggf. nur Chromium lauffähig (dann gezielt: `--project=chromium`).
 *
 * Der statische Server wird automatisch gestartet (`-c-1` schaltet Caching ab,
 * damit der Reload-Persistenz-Test frische Dateien sieht).
 */
module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://127.0.0.1:8123",
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  webServer: {
    command: "npx http-server . -p 8123 -s -c-1",
    url: "http://127.0.0.1:8123",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
