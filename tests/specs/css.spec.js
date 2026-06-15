const { test, expect } = require('@playwright/test');

test.describe('CSS theming', () => {

  // ── Light mode defaults ───────────────────────────────────────────
  test('applies light mode CSS custom properties', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/tests/fixtures/copilot.html');

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        cream: style.getPropertyValue('--ed-cream').trim(),
        text: style.getPropertyValue('--ed-text').trim(),
        terracotta: style.getPropertyValue('--ed-terracotta').trim(),
      };
    });
    expect(vars.cream).toBe('#FFF8F5');
    expect(vars.text).toBe('#4A3F3A');
    expect(vars.terracotta).toBe('#B87A5F');
  });

  // ── Dark mode ─────────────────────────────────────────────────────
  test('dark mode overrides CSS custom properties', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/tests/fixtures/copilot.html');

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        cream: style.getPropertyValue('--ed-cream').trim(),
        text: style.getPropertyValue('--ed-text').trim(),
      };
    });
    expect(vars.cream).toBe('#2A2523');
    expect(vars.text).toBe('#E8DDD6');
  });

  test('dark mode modal has dark background', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/tests/fixtures/copilot.html');
    await page.click('#ed-tools-btn');

    const bg = await page.locator('.ed-modal').evaluate(
      el => getComputedStyle(el).backgroundColor,
    );
    // rgba(45, 40, 38, 0.98) — should be dark
    expect(bg).toContain('45');
  });

  test('dark mode command button has dark background', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/tests/fixtures/copilot.html');
    await page.click('#ed-tools-btn');

    const bg = await page.locator('.ed-command-btn').first().evaluate(
      el => getComputedStyle(el).backgroundColor,
    );
    // #1F1C1A — dark
    expect(bg).toContain('31'); // rgb(31, 28, 26) — '31' from the red channel
  });

  // ── Reduced motion ────────────────────────────────────────────────
  test('reduced motion disables animations on trigger button', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tests/fixtures/copilot.html');

    const animation = await page.locator('#ed-tools-btn').evaluate(
      el => getComputedStyle(el).animation,
    );
    expect(animation).toBe('none');
  });

  test('reduced motion disables transitions on command buttons', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tests/fixtures/copilot.html');
    await page.click('#ed-tools-btn');

    const transition = await page.locator('.ed-command-btn').first().evaluate(
      el => getComputedStyle(el).transition,
    );
    expect(transition).toBe('none');
  });

  // ── Keyframe animations ───────────────────────────────────────────
  test('modal enter animation is defined', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');

    const hasKeyframe = await page.evaluate(() => {
      // Check that the keyframe rule exists in the stylesheet
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.name === 'ed-modal-enter') return true;
          }
        } catch (e) { /* cross-origin sheet */ }
      }
      return false;
    });
    expect(hasKeyframe).toBe(true);
  });

  // ── Floating layout ───────────────────────────────────────────────
  test('floating mode hides button span text', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot-fallback.html');

    const display = await page.locator('#ed-tools-btn span').evaluate(
      el => getComputedStyle(el).display,
    );
    expect(display).toBe('none');
  });

  // ── Sending state styles ──────────────────────────────────────────
  test('sending state prevents pointer events', async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    const pointerEvents = await page.locator('#ed-tools-btn').evaluate(
      el => getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe('none');
  });

  // ── Update badge pseudo-element ───────────────────────────────────
  test('update badge exists when update class present', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SEED_STORAGE__ = {
        lastUpdateCheck: Date.now(),
        latestVersion: '0.3.0',
        updateAvailable: true,
      };
    });
    await page.goto('/tests/fixtures/copilot.html');
    await page.waitForTimeout(500);

    // Check ::after pseudo-element content is non-empty
    const hasAfterContent = await page.locator('#ed-tools-btn').evaluate(el => {
      const after = getComputedStyle(el, '::after');
      return after.content !== 'none' && after.content !== '';
    });
    expect(hasAfterContent).toBe(true);
  });
});
