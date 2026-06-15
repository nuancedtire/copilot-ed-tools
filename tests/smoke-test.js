#!/usr/bin/env node
/**
 * smoke-test.js — Extension smoke test against M365 Copilot
 *
 * Runs HEADLESS using the persistent profile saved by auth.js.
 * If no auth profile exists yet, prints instructions and exits.
 *
 * Usage:
 *   node tests/auth.js          # first: log in (headed, you do MFA)
 *   node tests/smoke-test.js    # then: run this
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = '/tmp/playwright-profile';
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TARGET_URL = 'https://m365.cloud.microsoft/';

async function main() {
  // Check auth profile
  const authTs = path.join(PROFILE_DIR, '.auth-timestamp');
  if (!fs.existsSync(authTs)) {
    console.log('❌ No auth profile found.');
    console.log('   Run:  node tests/auth.js');
    console.log('   This opens a visible browser. Log in + MFA, then press Enter.');
    process.exit(1);
  }
  const age = Math.round((Date.now() - fs.statSync(authTs).mtimeMs) / 1000 / 60);
  console.log(`🔑 Auth profile found (${age} min old). Launching headless...`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });

  const page = browser.pages()[0] || await browser.newPage();

  // --- Navigate -----------------------------------------------------------
  console.log('🌐 Navigating to M365 Copilot...');
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Give the SPA a moment to render
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('Navigation result:', e.message.substring(0, 200));
  }

  const finalUrl = page.url();
  console.log('URL:', finalUrl.substring(0, 120));
  console.log('Title:', (await page.title()).substring(0, 120));

  // Bail early if we landed on login
  if (finalUrl.includes('login.microsoftonline.com') || finalUrl.includes('login.live.com')) {
    console.log('\n⚠️  Redirected to login. Session may have expired.');
    console.log('   Re-run:  node tests/auth.js');
    await page.screenshot({ path: '/tmp/copilot-login.png', fullPage: false });
    console.log('   Screenshot saved to /tmp/copilot-login.png');
    await browser.close();
    process.exit(1);
  }

  // --- Screenshot ----------------------------------------------------------
  await page.screenshot({ path: '/tmp/copilot-m365.png', fullPage: false });
  console.log('📸 Screenshot saved to /tmp/copilot-m365.png');

  // --- DOM body text -------------------------------------------------------
  const bodyText = await page.evaluate(() => {
    return document.body ? document.body.innerText.substring(0, 600) : 'NO BODY';
  });
  console.log('\n=== Body text preview ===');
  console.log(bodyText);

  // --- Copilot DOM elements ------------------------------------------------
  const domInfo = await page.evaluate(() => ({
    hasM365Wrapper: !!document.querySelector('#m365-chat-input-shared-wrapper'),
    contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
    hasChatTestId: !!document.querySelector('[data-testid*="chat"]'),
    hasRoleLog: !!document.querySelector('[role="log"]'),
    hasMain: !!document.querySelector('main'),
    url: location.href,
  }));
  console.log('\n=== DOM Analysis ===');
  console.log(JSON.stringify(domInfo, null, 2));

  // --- Extension injection ------------------------------------------------
  const extensionInfo = await page.evaluate(() => ({
    hasEdToolsBtn: !!document.getElementById('ed-tools-btn'),
    hasEdContainer: !!document.getElementById('ed-tools-container'),
    hasPromptsGlobal: typeof window.COPILOT_ED_TOOLS_PROMPTS !== 'undefined',
  }));
  console.log('\n=== Extension Injection ===');
  console.log(JSON.stringify(extensionInfo, null, 2));

  // --- Verdict -------------------------------------------------------------
  const ok = extensionInfo.hasEdContainer && extensionInfo.hasPromptsGlobal;
  console.log(ok ? '\n✅ Extension injected successfully.' : '\n❌ Extension did NOT inject.');
  console.log(ok ? '' : '   Check the DOM analysis above for clues.');

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
