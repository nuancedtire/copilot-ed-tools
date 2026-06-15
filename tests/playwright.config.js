const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../test-results', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:4321',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    headless: true,
  },
  webServer: {
    command: 'node server.js',
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
});
