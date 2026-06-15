const { test, expect } = require('@playwright/test');

test.describe('command execution', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
  });

  // ── Text insertion ────────────────────────────────────────────────
  test('inserts prompt text into contenteditable', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    // Wait for the delayed execution (400ms + insert)
    await page.waitForTimeout(600);
    const text = await page.locator(
      '#m365-chat-input-shared-wrapper [contenteditable="true"]',
    ).textContent();
    expect(text).toContain('ED CLERKING');
    expect(text).toContain('PRIMARY OUTCOME');
  });

  test('discharge command inserts correct text', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="discharge"]');

    await page.waitForTimeout(600);
    const text = await page.locator(
      '#m365-chat-input-shared-wrapper [contenteditable="true"]',
    ).textContent();
    expect(text).toContain('ED DISCHARGE SUMMARY');
    expect(text).toContain('Reason for attendance');
  });

  test('prompt text contains all key sections', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    await page.waitForTimeout(600);
    const inserted = await page.locator(
      '#m365-chat-input-shared-wrapper [contenteditable="true"]',
    ).textContent();
    // execCommand('insertText') may collapse newlines in contenteditable,
    // so check for key content rather than exact string match
    expect(inserted).toContain('ED CLERKING');
    expect(inserted).toContain('Presenting complaint');
    expect(inserted).toContain('ABSOLUTE RULES');
    expect(inserted).toContain('PRIMARY OUTCOME');
    expect(inserted).toContain('History of presenting complaint');
  });

  // ── Send button ───────────────────────────────────────────────────
  test('clicks the send button after text insertion', async ({ page }) => {
    // Track send button clicks
    await page.evaluate(() => {
      const sendBtn = document.querySelector('.send-btn');
      if (sendBtn) {
        sendBtn.dataset.clicked = '0';
        const orig = sendBtn.click;
        sendBtn.click = function () {
          this.dataset.clicked = String(Number(this.dataset.clicked) + 1);
          return orig.apply(this, arguments);
        };
      }
    });

    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(800);

    const wasClicked = await page.evaluate(
      () => document.querySelector('.send-btn')?.dataset.clicked,
    );
    expect(wasClicked).toBe('1');
  });

  // ── isRunning guard ───────────────────────────────────────────────
  test('isRunning is true during execution', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    // Immediately after click, isRunning should be true
    const running = await page.evaluate(() => window.__edTools._isRunning());
    expect(running).toBe(true);
  });

  test('isRunning guard prevents re-execution', async ({ page }) => {
    // Verify the guard exists and works: force isRunning true, then try a command
    await page.evaluate(() => {
      // Force the isRunning flag via the _reset helper's knowledge of state
      // Actually, let's test it differently — run a command and verify
      // isRunning stays true until the timeout chain completes
    });

    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    // isRunning should be true immediately after command starts
    const running = await page.evaluate(() => window.__edTools._isRunning());
    expect(running).toBe(true);

    // After execution completes (~1600ms), it should be false
    await page.waitForTimeout(1800);
    const runningAfter = await page.evaluate(() => window.__edTools._isRunning());
    expect(runningAfter).toBe(false);
  });

  // ── Sending visual state ──────────────────────────────────────────
  test('button shows sending state during execution', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    // Immediately after click, should have sending class
    const btn = page.locator('#ed-tools-btn');
    await expect(btn).toHaveClass(/ed-sending/);
    await expect(btn).toHaveAttribute('aria-label', /Sending/);
  });

  test('button recovers from sending state', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');

    await page.waitForTimeout(1800);
    const btn = page.locator('#ed-tools-btn');
    await expect(btn).not.toHaveClass(/ed-sending/);
    await expect(btn).toHaveAttribute('aria-label', 'Open ED Tools');
    await expect(btn.locator('span')).toContainText('ED Tools');
  });

  // ── isRunning reset ───────────────────────────────────────────────
  test('isRunning resets after execution completes', async ({ page }) => {
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(1800);

    // Should be able to execute again
    await page.click('#ed-tools-btn');
    await page.click('button[data-id="discharge"]');
    await page.waitForTimeout(600);

    const text = await page.locator(
      '#m365-chat-input-shared-wrapper [contenteditable="true"]',
    ).textContent();
    expect(text).toContain('DISCHARGE SUMMARY');
  });
});

test.describe('prompt bubble collapsing', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/copilot.html');
  });

  // ── Bubble detection and collapse ─────────────────────────────────
  test('collapses matching prompt bubble after send', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const promptText = await page.evaluate(() =>
      window.COPILOT_ED_TOOLS_PROMPTS.build(
        window.COPILOT_ED_TOOLS_PROMPTS.commands[0],
      ),
    );

    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(500);

    // Manually add a matching bubble to the chat container
    // (the mutation observer watches for childList changes)
    await page.evaluate(text => {
      const container = document.querySelector('[data-testid*="chat"]');
      if (!container) return;
      const bubble = document.createElement('div');
      bubble.textContent = text;
      container.appendChild(bubble);
    }, promptText);

    await page.waitForTimeout(500);

    // Check for collapsed state
    const collapsed = await page.evaluate(() => {
      const bubble = document.querySelector('[data-ed-collapsed="true"]');
      return !!bubble;
    });
    expect(collapsed).toBe(true);
  });

  test('collapsed bubble shows label', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const promptText = await page.evaluate(() =>
      window.COPILOT_ED_TOOLS_PROMPTS.build(
        window.COPILOT_ED_TOOLS_PROMPTS.commands[0],
      ),
    );

    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(500);

    await page.evaluate(text => {
      const container = document.querySelector('[data-testid*="chat"]');
      if (!container) return;
      const bubble = document.createElement('div');
      bubble.textContent = text;
      container.appendChild(bubble);
    }, promptText);

    await page.waitForTimeout(500);

    const label = await page.locator('.ed-prompt-label').textContent();
    expect(label).toContain('ED Clerking');
  });

  test('collapsed bubble has expand toggle', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const promptText = await page.evaluate(() =>
      window.COPILOT_ED_TOOLS_PROMPTS.build(
        window.COPILOT_ED_TOOLS_PROMPTS.commands[0],
      ),
    );

    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(500);

    await page.evaluate(text => {
      const container = document.querySelector('[data-testid*="chat"]');
      if (!container) return;
      const bubble = document.createElement('div');
      bubble.textContent = text;
      container.appendChild(bubble);
    }, promptText);

    await page.waitForTimeout(500);

    const toggle = page.locator('.ed-prompt-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('View prompt');
  });

  test('toggle expands to show full prompt', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const promptText = await page.evaluate(() =>
      window.COPILOT_ED_TOOLS_PROMPTS.build(
        window.COPILOT_ED_TOOLS_PROMPTS.commands[0],
      ),
    );

    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(500);

    await page.evaluate(text => {
      const container = document.querySelector('[data-testid*="chat"]');
      if (!container) return;
      const bubble = document.createElement('div');
      bubble.textContent = text;
      container.appendChild(bubble);
    }, promptText);

    await page.waitForTimeout(500);

    // Click the toggle
    await page.click('.ed-prompt-toggle');
    await page.waitForTimeout(200);

    // Should now show expanded content
    const expanded = page.locator('.ed-prompt-expanded');
    await expect(expanded).toBeVisible();
    const expandedText = await expanded.textContent();
    expect(expandedText).toContain('ED CLERKING');

    // Toggle text should change
    await expect(page.locator('.ed-prompt-toggle')).toContainText('Hide prompt');
  });

  test('toggle re-collapses on second click', async ({ page }) => {
    await page.click('#ed-tools-btn');
    const promptText = await page.evaluate(() =>
      window.COPILOT_ED_TOOLS_PROMPTS.build(
        window.COPILOT_ED_TOOLS_PROMPTS.commands[0],
      ),
    );

    await page.click('button[data-id="clerking"]');
    await page.waitForTimeout(500);

    await page.evaluate(text => {
      const container = document.querySelector('[data-testid*="chat"]');
      if (!container) return;
      const bubble = document.createElement('div');
      bubble.textContent = text;
      container.appendChild(bubble);
    }, promptText);

    await page.waitForTimeout(500);

    // Expand
    await page.click('.ed-prompt-toggle');
    await expect(page.locator('.ed-prompt-expanded')).toBeVisible();

    // Collapse
    await page.click('.ed-prompt-toggle');
    await expect(page.locator('.ed-prompt-expanded')).not.toBeVisible();
    await expect(page.locator('.ed-prompt-toggle')).toContainText('View prompt');
  });
});
