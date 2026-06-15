const { test, expect } = require('@playwright/test');

test.describe('update check', () => {

  // ── Happy path: newer version available ───────────────────────────
  test('shows update badge when newer version available', async ({ page }) => {
    await page.route(
      '**/api.github.com/repos/nuancedtire/copilot-ed-tools/releases/latest',
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tag_name: 'v0.3.0' }),
      }),
    );

    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(800);
    await expect(page.locator('#ed-tools-btn')).toHaveClass(/ed-tools-update/);
  });

  // ── No badge when versions match ──────────────────────────────────
  test('no badge when latest matches current', async ({ page }) => {
    await page.route(
      '**/api.github.com/repos/nuancedtire/copilot-ed-tools/releases/latest',
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tag_name: 'v0.2.0' }),
      }),
    );

    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(800);
    await expect(page.locator('#ed-tools-btn')).not.toHaveClass(/ed-tools-update/);
  });

  // ── Badge is cached; no re-fetch ──────────────────────────────────
  test('uses cached storage and skips fetch when recent', async ({ page }) => {
    let fetchCount = 0;
    await page.route(
      '**/api.github.com/repos/nuancedtire/copilot-ed-tools/releases/latest',
      route => {
        fetchCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tag_name: 'v0.3.0' }),
        });
      },
    );

    // Seed storage BEFORE page scripts run via addInitScript
    // The chrome mock picks up window.__SEED_STORAGE__ as its initial _data
    await page.addInitScript(() => {
      window.__SEED_STORAGE__ = {
        lastUpdateCheck: Date.now(),
        latestVersion: '0.3.0',
        updateAvailable: true,
      };
    });

    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(500);

    await expect(page.locator('#ed-tools-btn')).toHaveClass(/ed-tools-update/);
    expect(fetchCount).toBe(0);
  });

  // ── Fetch failure is silent ───────────────────────────────────────
  test('handles fetch error gracefully', async ({ page }) => {
    await page.route(
      '**/api.github.com/repos/nuancedtire/copilot-ed-tools/releases/latest',
      route => route.abort('internetdisconnected'),
    );

    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(800);

    await expect(page.locator('#ed-tools-btn')).toBeVisible();
    await expect(page.locator('#ed-tools-btn')).not.toHaveClass(/ed-tools-update/);
  });

  // ── Badge visible in popover ─────────────────────────────────────
  test('shows update notice in popover when update available', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SEED_STORAGE__ = {
        lastUpdateCheck: Date.now(),
        latestVersion: '0.3.0',
        updateAvailable: true,
      };
    });

    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(500);

    await page.click('#ed-tools-btn');
    const notice = page.locator('.ed-update-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('v0.3.0');
  });

  // ── No update notice when current ────────────────────────────────
  test('no update notice in popover when current', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(500);

    await page.click('#ed-tools-btn');
    await expect(page.locator('.ed-update-notice')).not.toBeVisible();
  });
});
