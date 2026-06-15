const { test, expect } = require('@playwright/test');

test.describe('popover', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
  });

  // ── Open / close ──────────────────────────────────────────────────
  test('opens popover on button click', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
  });

  test('closes popover when clicking button again (toggle)', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  test('closes on click-outside', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
    // Click on body, away from the popover
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  test('closes via close button', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
    await page.click('#ed-tools-close');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  // ── ARIA / semantic attributes ────────────────────────────────────
  test('popover has role="menu"', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toHaveAttribute('role', 'menu');
  });

  test('command buttons have role="menuitem"', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const items = page.locator('button[role="menuitem"][data-id]');
    await expect(items).toHaveCount(2);
  });

  test('button aria-expanded reflects open state', async ({ page }) => {
    const btn = page.locator('#ed-tools-btn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await page.click('#ed-tools-close');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('button gets ed-active class when open', async ({ page }) => {
    const btn = page.locator('#ed-tools-btn');
    await expect(btn).not.toHaveClass(/ed-active/);
    await btn.click();
    await expect(btn).toHaveClass(/ed-active/);
  });

  // ── Command items ─────────────────────────────────────────────────
  test('renders both commands (clerking and discharge)', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('button[data-id="clerking"]')).toBeVisible();
    await expect(page.locator('button[data-id="discharge"]')).toBeVisible();
  });

  test('command labels match prompts data', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('button[data-id="clerking"] .ed-command-label'))
      .toContainText('ED Clerking');
    await expect(page.locator('button[data-id="discharge"] .ed-command-label'))
      .toContainText('Discharge Summary');
  });

  // ── Version display ───────────────────────────────────────────────
  test('shows extension version in subtitle', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const subtitle = page.locator('.ed-modal-subtitle .ed-version');
    await expect(subtitle).toContainText('v0.2.0');
  });

  // ── Exit animation ────────────────────────────────────────────────
  test('adds exit animation class on close', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // The modal gets ed-modal-exit class via closeMenu
    // But we need to observe it before removal — use evaluate to spy
    const hadExitClass = await page.evaluate(() => {
      return new Promise(resolve => {
        const observer = new MutationObserver(() => {
          const modal = document.getElementById('ed-tools-modal');
          if (modal && modal.classList.contains('ed-modal-exit')) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        document.getElementById('ed-tools-close').click();
        setTimeout(() => { observer.disconnect(); resolve(false); }, 500);
      });
    });
    expect(hadExitClass).toBe(true);
  });

  // ── Multiple opens ────────────────────────────────────────────────
  test('never has more than one popover', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('#ed-tools-btn'); // toggle again quickly
    // Should be closed (toggle), not duplicated
    await page.waitForTimeout(400);
    const count = await page.locator('#ed-tools-modal').count();
    expect(count).toBe(0);
    // Fast triple-click
    await page.click('#ed-tools-btn', { clickCount: 3, delay: 50 });
    await page.waitForTimeout(500);
    const visibleCount = await page.locator('#ed-tools-modal').count();
    expect(visibleCount).toBeLessThanOrEqual(1);
  });

  // ── Focus return on close ─────────────────────────────────────────
  test('returns focus to trigger button on close', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('#ed-tools-close');
    await page.waitForTimeout(300);
    await expect(page.locator('#ed-tools-btn')).toBeFocused();
  });
});
