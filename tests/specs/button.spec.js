const { test, expect } = require('@playwright/test');

test.describe('button anchoring', () => {

  // ── Injection ─────────────────────────────────────────────────────
  test('creates button and container on init', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');

    const btn = page.locator('#ed-tools-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-label', 'Open ED Tools');
    await expect(btn).toHaveAttribute('aria-haspopup', 'true');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn.locator('span')).toHaveText('ED Tools');
  });

  test('button has SVG icon', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    const svg = page.locator('#ed-tools-btn svg');
    await expect(svg).toBeVisible();
  });

  test('container exists exactly once', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    const count = await page.locator('#ed-tools-container').count();
    expect(count).toBe(1);
  });

  test('container not duplicated if init runs twice', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    // Trigger re-init by dispatching a DOM mutation
    await page.evaluate(() => {
      const div = document.createElement('div');
      document.body.appendChild(div);
    });
    await page.waitForTimeout(400);
    const count = await page.locator('#ed-tools-container').count();
    expect(count).toBe(1);
  });

  // ── Anchoring ─────────────────────────────────────────────────────
  test('anchors to wrapper when present (non-floating)', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    const container = page.locator('#ed-tools-container');
    await expect(container).not.toHaveClass(/ed-floating/);
  });

  test('falls back to floating FAB when wrapper absent', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot-fallback.html');
    const container = page.locator('#ed-tools-container');
    await expect(container).toHaveClass(/ed-floating/);
  });

  test('floating mode hides button text', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot-fallback.html');
    // In floating mode, container has .ed-floating class
    // CSS rule: .ed-floating .ed-tools-trigger span { display: none }
    const span = page.locator('#ed-tools-btn span');
    const display = await span.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  // ── Font injection ────────────────────────────────────────────────
  test('injects Google Fonts link', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    const link = page.locator('#ed-tools-fonts');
    await expect(link).toHaveCount(1);
    const href = await link.getAttribute('href');
    expect(href).toContain('fonts.googleapis.com');
  });

  test('font link not duplicated on re-init', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    await page.evaluate(() => {
      const div = document.createElement('div');
      document.body.appendChild(div);
    });
    await page.waitForTimeout(400);
    const links = await page.locator('#ed-tools-fonts').count();
    expect(links).toBe(1);
  });

  // ── Resize repositioning ──────────────────────────────────────────
  test('repositions button on window resize', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    const before = await page.locator('#ed-tools-container').boundingBox();
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);
    const after = await page.locator('#ed-tools-container').boundingBox();
    // Bottom offset should have changed
    const hasChanged = before.y !== after.y || before.x !== after.x;
    expect(hasChanged).toBe(true);
  });

  // ── Edges ─────────────────────────────────────────────────────────
  test('button is visible after page load', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    // The button has an enter animation — wait for it to finish
    await page.waitForSelector('#ed-tools-btn', { state: 'visible' });
    const opacity = await page.locator('#ed-tools-btn').evaluate(
      el => getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });
});
