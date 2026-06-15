const { test, expect } = require('@playwright/test');

test.describe('utilities', () => {

  // ── debounce ──────────────────────────────────────────────────────
  test.describe('debounce', () => {
    test('delays execution until timeout elapses', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => {
        let calls = 0;
        const fn = window.__edTools.debounce(() => { calls++; }, 100);
        fn();
        return calls; // should be 0 before timeout
      });
      expect(result).toBe(0);
    });

    test('resets timer on repeated calls', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const calls = await page.evaluate(async () => {
        let count = 0;
        const fn = window.__edTools.debounce(() => { count++; }, 200);
        fn();
        fn();
        fn();
        await new Promise(r => setTimeout(r, 250));
        return count;
      });
      expect(calls).toBe(1);
    });

    test('passes arguments to the wrapped function', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(async () => {
        let captured;
        const fn = window.__edTools.debounce((a, b) => { captured = a + b; }, 50);
        fn(3, 7);
        await new Promise(r => setTimeout(r, 100));
        return captured;
      });
      expect(result).toBe(10);
    });
  });

  // ── escapeHtml ────────────────────────────────────────────────────
  test.describe('escapeHtml', () => {
    test('escapes ampersand', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml('a & b'));
      expect(result).toBe('a &amp; b');
    });

    test('escapes less-than', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml('a < b'));
      expect(result).toBe('a &lt; b');
    });

    test('escapes greater-than', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml('a > b'));
      expect(result).toBe('a &gt; b');
    });

    test('escapes double-quote', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml('say "hello"'));
      expect(result).toBe('say &quot;hello&quot;');
    });

    test('escapes single-quote', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml("it's"));
      expect(result).toBe('it&#039;s');
    });

    test('passes plain text through unchanged', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml('plain text 123'));
      expect(result).toBe('plain text 123');
    });

    test('handles empty string', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.escapeHtml(''));
      expect(result).toBe('');
    });
  });

  // ── normaliseText ─────────────────────────────────────────────────
  test.describe('normaliseText', () => {
    test('collapses multiple spaces', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.normaliseText('hello   world'));
      expect(result).toBe('hello world');
    });

    test('trims leading and trailing whitespace', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.normaliseText('  padded  '));
      expect(result).toBe('padded');
    });

    test('collapses newlines into spaces', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const result = await page.evaluate(() => window.__edTools.normaliseText('line1\nline2\n\nline3'));
      expect(result).toBe('line1 line2 line3');
    });

    test('returns empty string for null/undefined', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const n = await page.evaluate(() => window.__edTools.normaliseText(null));
      expect(n).toBe('');
    });
  });

  // ── isNewerVersion ────────────────────────────────────────────────
  test.describe('isNewerVersion', () => {
    test('major version greater → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('2.0.0', '1.9.9'));
      expect(r).toBe(true);
    });

    test('minor version greater → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('0.3.0', '0.2.5'));
      expect(r).toBe(true);
    });

    test('patch version greater → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('0.2.1', '0.2.0'));
      expect(r).toBe(true);
    });

    test('equal versions → false', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('0.2.0', '0.2.0'));
      expect(r).toBe(false);
    });

    test('older version → false', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('0.1.0', '0.2.0'));
      expect(r).toBe(false);
    });

    test('two-component version treated as 3-component', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      // '0.3' → [0, 3, NaN] ... wait, Number('3') = 3 but '0.3'.split('.') = ['0','3']
      // Let's test the actual behavior: 0.3 → [0, 3], compared to 0.2.0 → [0, 2, 0]
      // At index 2: 0 is undefined → 0, so 0.3 is treated as 0.3.0 — equal major.minor, but index 2: l=0, c=0 → equal, continue, return false
      // Actually, isNewerVersion('0.3', '0.2.0') would be [0,3] vs [0,2,0] — index 0 equal, index 1: 3 > 2 → true
      const r = await page.evaluate(() => window.__edTools.isNewerVersion('0.3', '0.2.0'));
      expect(r).toBe(true);
    });
  });

  // ── isLikelyInjectedPrompt ────────────────────────────────────────
  test.describe('isLikelyInjectedPrompt', () => {
    test('exact match returns true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isLikelyInjectedPrompt('hello world', 'hello world'));
      expect(r).toBe(true);
    });

    test('bubble starts with first 250 chars of prompt → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const longPrompt = 'A'.repeat(300) + ' unique suffix';
      const bubbleText = 'A'.repeat(250);
      const r = await page.evaluate(
        ({ b, p }) => window.__edTools.isLikelyInjectedPrompt(b, p),
        { b: bubbleText, p: longPrompt },
      );
      expect(r).toBe(true);
    });

    test('bubble contains first 250 chars → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const prompt = 'A'.repeat(300);
      const bubble = 'prefix ' + 'A'.repeat(250) + ' suffix';
      const r = await page.evaluate(
        ({ b, p }) => window.__edTools.isLikelyInjectedPrompt(b, p),
        { b: bubble, p: prompt },
      );
      expect(r).toBe(true);
    });

    test('bubble contains first sentence → true', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const prompt = 'This is the first sentence. Then more stuff happens.';
      const bubble = 'some wrapper This is the first sentence extra';
      const r = await page.evaluate(
        ({ b, p }) => window.__edTools.isLikelyInjectedPrompt(b, p),
        { b: bubble, p: prompt },
      );
      expect(r).toBe(true);
    });

    test('completely different text → false', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(
        () => window.__edTools.isLikelyInjectedPrompt('unrelated', 'specific prompt text'),
      );
      expect(r).toBe(false);
    });

    test('empty strings → false', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isLikelyInjectedPrompt('', ''));
      expect(r).toBe(false);
    });

    test('null bubble text → false', async ({ page }) => {
      await page.goto('/tests/fixtures/copilot.html');
      const r = await page.evaluate(() => window.__edTools.isLikelyInjectedPrompt(null, 'hello'));
      expect(r).toBe(false);
    });
  });
});
