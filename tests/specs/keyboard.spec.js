const { test, expect } = require('@playwright/test');

test.describe('keyboard navigation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
  });

  // ── Escape ────────────────────────────────────────────────────────
  test('Escape closes popover', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  // ── Arrow keys ────────────────────────────────────────────────────
  // Focus order: [clerking(0), discharge(1), close(2)]
  test('ArrowDown cycles forward through items', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // Start: clerking (index 0)
    await expect(page.locator('button[data-id="clerking"]')).toBeFocused();

    // ArrowDown → discharge (index 1)
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('button[data-id="discharge"]')).toBeFocused();

    // ArrowDown → close (index 2)
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#ed-tools-close')).toBeFocused();

    // ArrowDown → wrap to clerking (index 0)
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('button[data-id="clerking"]')).toBeFocused();
  });

  test('ArrowUp cycles backward through items', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // Start: clerking (index 0)
    // ArrowUp → wraps to close (index 2, last item)
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#ed-tools-close')).toBeFocused();

    // ArrowUp → discharge (index 1)
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('button[data-id="discharge"]')).toBeFocused();
  });

  test('ArrowRight acts like ArrowDown', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // ArrowRight → discharge (index 1)
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('button[data-id="discharge"]')).toBeFocused();
  });

  test('ArrowLeft acts like ArrowUp (wraps to last)', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // ArrowLeft → wraps to close (last item)
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#ed-tools-close')).toBeFocused();
  });

  // ── Enter / Space ─────────────────────────────────────────────────
  test('Enter on command executes it', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // clerking is focused by default
    await expect(page.locator('button[data-id="clerking"]')).toBeFocused();
    await page.keyboard.press('Enter');
    // Popover closes and text inserted
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
    const text = await page.locator('#m365-chat-input-shared-wrapper [contenteditable="true"]').textContent();
    expect(text).toContain('ED CLERKING');
  });

  test('Space on focused command executes it', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // Navigate to discharge: ArrowDown from clerking → discharge
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('button[data-id="discharge"]')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
    const text = await page.locator('#m365-chat-input-shared-wrapper [contenteditable="true"]').textContent();
    expect(text).toContain('DISCHARGE SUMMARY');
  });

  test('Enter on close button closes popover', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // ArrowDown → discharge (1), ArrowDown → close (2)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#ed-tools-close')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  // ── Tab trap ──────────────────────────────────────────────────────
  test('Tab trapped within popover', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // Start: clerking (0)
    // Tab → discharge (1)
    await page.keyboard.press('Tab');
    await expect(page.locator('button[data-id="discharge"]')).toBeFocused();
    // Tab → close (2)
    await page.keyboard.press('Tab');
    await expect(page.locator('#ed-tools-close')).toBeFocused();
    // Tab → wrap to clerking (0)
    await page.keyboard.press('Tab');
    await expect(page.locator('button[data-id="clerking"]')).toBeFocused();
  });

  test('Shift+Tab wraps backward', async ({ page }) => {
    await page.click('#ed-tools-btn');
    // Shift+Tab from clerking (0) → close (2)
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#ed-tools-close')).toBeFocused();
  });

  // ── Number shortcuts ──────────────────────────────────────────────
  test('key 1 triggers clerking command', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.keyboard.press('1');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
    const text = await page.locator('#m365-chat-input-shared-wrapper [contenteditable="true"]').textContent();
    expect(text).toContain('ED CLERKING');
  });

  test('key 2 triggers discharge command', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.keyboard.press('2');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
    const text = await page.locator('#m365-chat-input-shared-wrapper [contenteditable="true"]').textContent();
    expect(text).toContain('DISCHARGE SUMMARY');
  });

  test('number keys with modifier do not trigger', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.keyboard.press('Control+Digit1');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
  });

  // ── Focus return ──────────────────────────────────────────────────
  test('returns focus to trigger button after Escape close', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#ed-tools-btn')).toBeFocused();
  });
});

test.describe('global shortcuts', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
  });

  test('Alt+E opens popover', async ({ page }) => {
    await page.keyboard.press('Alt+KeyE');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
  });

  test('Ctrl+Shift+E opens popover', async ({ page }) => {
    await page.keyboard.press('Control+Shift+KeyE');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
  });

  test('Alt+E toggles (closes when open)', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await expect(page.locator('#ed-tools-modal')).toBeVisible();
    await page.keyboard.press('Alt+KeyE');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });

  test('unrelated shortcuts do not toggle', async ({ page }) => {
    await page.keyboard.press('Alt+KeyR');
    await expect(page.locator('#ed-tools-modal')).not.toBeVisible();
  });
});
