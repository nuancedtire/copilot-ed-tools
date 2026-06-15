#!/usr/bin/env node
/**
 * auth.js — M365 Copilot login helper
 *
 * Launches a HEADED Chromium browser pointed at M365 Copilot.
 * You handle the login + MFA in the browser window yourself.
 * Once you're in, press Enter in this terminal to close.
 * Session cookies are persisted to /tmp/playwright-profile
 * so the headless smoke test can reuse them.
 *
 * Usage:
 *   node tests/auth.js                # fresh login, keep existing profile
 *   node tests/auth.js --fresh        # wipe old profile, start clean
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const PROFILE_DIR = '/tmp/playwright-profile';
const TARGET_URL = 'https://m365.cloud.microsoft/';
const EXTENSION_PATH = path.resolve(__dirname, '..');

async function main() {
  const fresh = process.argv.includes('--fresh');

  if (fresh) {
    console.log('🧹 Wiping old profile...');
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }

  console.log('🚀 Launching Chromium (headed — you will see a browser window)...');
  console.log(`   Extension loaded from: ${EXTENSION_PATH}`);
  console.log('');

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });

  const page = browser.pages()[0] || await browser.newPage();

  // Monitor URL changes so we can tell when auth is done
  let currentUrl = 'about:blank';
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url !== currentUrl) {
        currentUrl = url;
        const label = url.includes('login.microsoftonline.com') ? '🔐 Login page'
          : url.includes('login.live.com') ? '🔐 Microsoft Account'
          : url.includes('m365.cloud.microsoft') ? '✅ M365 Copilot'
          : url.includes('copilot.cloud.microsoft') ? '✅ Copilot'
          : '🌐';
        console.log(`   ${label}  ${url.substring(0, 120)}`);
      }
    }
  });

  console.log('🌐 Navigating to M365 Copilot...');
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    // Login redirects often trigger navigation timeouts — that's fine
    console.log(`   (navigation settled: ${e.message.substring(0, 80)})`);
  }

  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│                                                              │');
  console.log('│  A browser window should be open.                            │');
  console.log('│                                                              │');
  console.log('│  👤 Sign in with your NHS / M365 account                    │');
  console.log('│  📱 Complete MFA in the browser                             │');
  console.log('│                                                              │');
  console.log('│  Wait until you see the Copilot chat interface.              │');
  console.log('│  Then come back here and press Enter.                        │');
  console.log('│                                                              │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');

  // Wait for user to press Enter
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter when you\'re logged in... ', () => {
    rl.close();
    resolve();
  }));

  // Quick check: are we actually on Copilot?
  const finalUrl = page.url();
  const onCopilot = finalUrl.includes('cloud.microsoft');

  if (onCopilot) {
    console.log(`\n✅ Authenticated! Final URL: ${finalUrl.substring(0, 100)}`);
  } else {
    console.log(`\n⚠️  Current URL is: ${finalUrl.substring(0, 100)}`);
    console.log('   Does not look like Copilot. Cookies are still saved —');
    console.log('   you can re-run auth.js or just run the smoke test.');
  }

  // Save a little state file so smoke test can verify profile freshness
  fs.writeFileSync(path.join(PROFILE_DIR, '.auth-timestamp'), new Date().toISOString());

  await browser.close();
  console.log('🔒 Browser closed. Profile saved to', PROFILE_DIR);
  console.log('   Run smoke test: node tests/smoke-test.js');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
