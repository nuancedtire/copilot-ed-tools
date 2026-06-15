#!/usr/bin/env node
/**
 * auth-headless.js — M365 Copilot login for headless environments
 *
 * Starts a headless Chromium and a local control webpage.
 * You visit the webpage, see screenshots of the login flow,
 * and type your credentials/MFA codes there.
 * All input goes directly to the local browser — never logged.
 *
 * Usage:
 *   node tests/auth-headless.js              # default port 3456
 *   node tests/auth-headless.js --port 8080  # custom port
 *   node tests/auth-headless.js --fresh      # wipe old profile
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Config ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const PORT = parseInt(args[args.indexOf('--port') + 1] || process.env.PORT || '3456', 10);
const FRESH = args.includes('--fresh');
const PROFILE_DIR = '/tmp/playwright-profile';
const SCREENSHOT_PATH = '/tmp/copilot-auth-screenshot.png';
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TARGET_URL = 'https://m365.cloud.microsoft/';

let browser, page, currentUrl = TARGET_URL;
let server;

// ── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function log(msg) {
  process.stderr.write(`[auth] ${msg}\n`);
}

async function takeScreenshot() {
  try {
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false, timeout: 5000 });
  } catch (e) { /* stale screenshot is better than crashing */ }
}

// ── Auto-click Sign In button on the M365 landing page ───────────────────
// The landing page at m365.cloud.microsoft has a "Sign in" button/link
// that redirects to login.microsoftonline.com. Click it automatically.

async function clickSignInIfOnLandingPage() {
  const url = page.url();
  // If we're on the M365 landing page (not yet at login, not yet authenticated)
  if (url.includes('login.') || (url.includes('cloud.microsoft') && !url.includes('m365.cloud.microsoft'))) {
    return false; // already at login or authenticated
  }

  try {
    // Try various selectors for the Sign In button/link
    const clicked = await page.evaluate(() => {
      // Microsoft's landing page: look for sign-in links/buttons
      const candidates = [
        ...document.querySelectorAll('a[href*="login"], a[href*="signin"], a[href*="SignIn"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('a'),
      ];
      for (const el of candidates) {
        const text = (el.textContent || '').trim().toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        if (
          text === 'sign in' || text === 'sign-in' || text === 'signin' ||
          text === 'log in' || text === 'login' ||
          href.includes('login.microsoftonline.com') || href.includes('login.live.com')
        ) {
          el.click();
          return { clicked: true, text, tag: el.tagName };
        }
      }
      return { clicked: false };
    });

    if (clicked.clicked) {
      log(`Auto-clicked "${clicked.text}" (${clicked.tag}) — redirecting to login...`);
      await page.waitForTimeout(3000);
      return true;
    }
  } catch (e) {
    log(`Auto-click sign-in failed: ${e.message}`);
  }
  return false;
}

// ── HTTP Server ──────────────────────────────────────────────────────────

const HTML_PAGE = (screenshotTs, url, message) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M365 Copilot — Auth</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    max-width: 960px; margin: 0 auto; padding: 1em;
    background: #1a1a1a; color: #ddd;
  }
  h2 { margin: 0 0 0.3em; font-size: 1.2em; color: #fff; }
  .url-bar {
    font-size: 0.75em; color: #6af; word-break: break-all;
    background: #222; padding: 0.5em 0.75em; border-radius: 4px; margin-bottom: 1em;
  }
  .screenshot-wrap {
    position: relative; border: 1px solid #333; border-radius: 6px;
    overflow: hidden; background: #000; margin-bottom: 1em;
  }
  .screenshot-wrap img { display: block; width: 100%; height: auto; }
  .screenshot-wrap .stale {
    position: absolute; top: 8px; right: 10px;
    background: rgba(0,0,0,.7); color: #fa0; font-size: 0.7em;
    padding: 2px 8px; border-radius: 3px;
  }
  form { display: flex; gap: 0.4em; flex-wrap: wrap; align-items: center; margin-bottom: 0.5em; }
  input[type="text"] {
    flex: 1; min-width: 200px; padding: 0.65em 0.8em; font-size: 1em;
    border-radius: 4px; border: 1px solid #555; background: #222; color: #eee;
    font-family: inherit;
  }
  input[type="text"]:focus { outline: none; border-color: #0078d4; }
  button {
    padding: 0.65em 1em; font-size: 0.85em; border-radius: 4px;
    border: 1px solid #555; cursor: pointer; background: #333; color: #ddd;
    white-space: nowrap; font-family: inherit;
  }
  button:hover { background: #444; }
  button.primary { background: #0078d4; border-color: #0078d4; color: #fff; }
  button.primary:hover { background: #1a8af0; }
  button.danger { background: #5c1a1a; border-color: #822; color: #faa; }
  button.warn { background: #5a4a1a; border-color: #862; color: #fca; }
  .hint { color: #888; font-size: 0.8em; margin-top: 1em; line-height: 1.5; }
  .hint strong { color: #aaa; }
  .msg { padding: 0.5em 0.75em; border-radius: 4px; margin-bottom: 1em; font-size: 0.85em; }
  .msg-ok { background: #1a3a1a; color: #8c8; border: 1px solid #263; }
  .msg-info { background: #1a2a3a; color: #8ac; border: 1px solid #234; }
  .msg-warn { background: #3a3a1a; color: #ca8; border: 1px solid #432; }
  hr { border: none; border-top: 1px solid #333; margin: 1.2em 0; }
  .done-btn { display: block; width: 100%; padding: 0.8em; font-size: 1em; margin-top: 0.5em; }
</style>
</head>
<body>
  <h2>🔐 M365 Copilot Login</h2>
  <div class="url-bar">📍 ${escapeHtml(url)}</div>
  ${message}
  <div class="screenshot-wrap">
    <img src="/screenshot.png?t=${screenshotTs}" alt="Browser screenshot" id="shot">
    <div class="stale" id="stale-badge" style="display:none">⚠ stale — resubmit form to refresh</div>
  </div>
  <form method="POST" action="/action" autocomplete="off">
    <input type="text" name="text" id="text"
      placeholder="Email, password, or MFA code..."
      autofocus autocomplete="off">
    <button type="submit" name="action" value="type-enter" class="primary">Type + Enter ↵</button>
    <button type="submit" name="action" value="type">Type only</button>
    <button type="submit" name="action" value="enter">Enter ↵</button>
    <button type="submit" name="action" value="tab">Tab ↹</button>
    <button type="submit" name="action" value="click" class="warn">Click 🖱</button>
  </form>
  <p class="hint">
    <strong>Steps:</strong> ① Click sign-in links with <em>Click</em> or <em>Tab + Enter</em> &nbsp;
    ② Enter email → <em>Type + Enter</em> &nbsp;
    ③ Enter password → <em>Type + Enter</em> &nbsp;
    ④ Paste MFA code → <em>Type + Enter</em><br>
    <strong>When Copilot loads</strong> (chat UI visible), click the red button below.
  </p>
  <hr>
  <form method="POST" action="/done">
    <button type="submit" class="done-btn danger">✅ Iʼm logged in — close & save session</button>
  </form>
  <script>
    let ts = ${screenshotTs};
    let interval;
    function startPoll() {
      interval = setInterval(async () => {
        try {
          const r = await fetch('/ping');
          const j = await r.json();
          if (j.ts !== ts) {
            document.getElementById('shot').src = '/screenshot.png?t=' + j.ts;
            document.getElementById('stale-badge').style.display = 'none';
            ts = j.ts;
          } else {
            document.getElementById('stale-badge').style.display = (Date.now()/1000 - ts > 10) ? '' : 'none';
          }
        } catch(e) {}
      }, 3000);
    }
    startPoll();
    document.addEventListener('click', () => document.getElementById('text').focus());
  </script>
</body>
</html>`;

let screenshotTimestamp = 0;
let lastMessage = '';

async function updateScreenshot() {
  await takeScreenshot();
  screenshotTimestamp = Math.floor(Date.now() / 1000);
}

function serveMainPage(res, message) {
  if (message) lastMessage = message;
  const msgClass = lastMessage.startsWith('✅') ? 'msg-ok'
    : lastMessage.startsWith('⚠') ? 'msg-warn'
    : lastMessage.startsWith('🔐') ? 'msg-info' : '';
  const msgHtml = lastMessage
    ? `<div class="msg ${msgClass}">${escapeHtml(lastMessage)}</div>`
    : '';
  const html = HTML_PAGE(screenshotTimestamp, currentUrl, msgHtml);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

// ── Request router ────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const params = new URLSearchParams(body);
      resolve({ text: params.get('text') || '', action: params.get('action') || '' });
    });
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // GET /
    if (req.method === 'GET' && url.pathname === '/') {
      serveMainPage(res);
      return;
    }

    // GET /screenshot.png
    if (req.method === 'GET' && url.pathname === '/screenshot.png') {
      const data = fs.readFileSync(SCREENSHOT_PATH);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length });
      res.end(data);
      return;
    }

    // GET /ping
    if (req.method === 'GET' && url.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ts: screenshotTimestamp, url: currentUrl }));
      return;
    }

    // POST /action
    if (req.method === 'POST' && url.pathname === '/action') {
      const { text, action } = await parseBody(req);
      log(`action: "${action}" text-length: ${text.length}`);

      try {
        switch (action) {
          case 'type-enter':
            // Clear any auto-filled junk first, then type
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            if (text) await page.keyboard.type(text, { delay: 20 });
            await page.keyboard.press('Enter');
            lastMessage = text ? 'Cleared + typed "••••••" + Enter' : 'Pressed Enter';
            break;
          case 'type':
            // Clear any auto-filled junk first, then type
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            if (text) {
              await page.keyboard.type(text, { delay: 20 });
              lastMessage = 'Cleared + typed "••••••"';
            }
            break;
          case 'enter':
            await page.keyboard.press('Enter');
            lastMessage = 'Pressed Enter';
            break;
          case 'tab':
            await page.keyboard.press('Tab');
            lastMessage = 'Pressed Tab — focus moved to next element';
            break;
          case 'click':
            // Click whatever is currently focused
            await page.keyboard.press('Enter'); // easiest way to "click" the focused element
            lastMessage = 'Clicked (Enter on focused element)';
            break;
        }
        await page.waitForTimeout(1500);
        currentUrl = page.url();
        await updateScreenshot();

        // Auto-detect state
        if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('login.live.com')) {
          lastMessage = '🔐 Login page — enter your email/password.';
        } else if (currentUrl.includes('login.') && currentUrl.includes('microsoft')) {
          lastMessage = '🔐 Microsoft login — enter credentials.';
        } else if (currentUrl.includes('cloud.microsoft') && !currentUrl.includes('login.')) {
          lastMessage = '✅ Looks like Copilot! If chat UI is visible, click the red button.';
        }
      } catch (e) {
        lastMessage = `⚠ Error: ${e.message.substring(0, 80)}`;
        log(`error: ${e.message}`);
      }

      serveMainPage(res);
      return;
    }

    // POST /done
    if (req.method === 'POST' && url.pathname === '/done') {
      currentUrl = page.url();
      await updateScreenshot();

      const onCopilot = currentUrl.includes('cloud.microsoft') && !currentUrl.includes('login.');
      if (onCopilot) {
        lastMessage = '✅ Session saved! You can close this page.';
        fs.writeFileSync(path.join(PROFILE_DIR, '.auth-timestamp'), new Date().toISOString());
      } else {
        lastMessage = `⚠ URL doesn't look like Copilot. Keep going or click again to force-save.`;
      }

      serveMainPage(res);

      if (onCopilot) {
        log('User confirmed auth complete. Shutting down...');
        setTimeout(async () => {
          server.close();
          await browser.close().catch(() => {});
          log('Browser closed. Profile saved to ' + PROFILE_DIR);
          log('Run: node tests/smoke-test.js');
          process.exit(0);
        }, 500);
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end('Not found');

  } catch (e) {
    log(`server error: ${e.message}`);
    res.writeHead(500);
    res.end('Internal error');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (FRESH) {
    log('Wiping old profile...');
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }

  // Start HTTP server first
  server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(PORT, '0.0.0.0', resolve));
  log(`HTTP server listening on http://0.0.0.0:${PORT}`);

  // Launch headless browser
  log('Launching headless Chromium...');
  browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=PasswordManager,PasswordAutofill',
      '--disable-save-password-bubble',
      '--disable-password-generator',
    ],
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });

  page = browser.pages()[0] || await browser.newPage();

  // Track URL changes
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url !== currentUrl) {
        currentUrl = url;
        const label = url.includes('login.microsoftonline.com') ? '🔐 MS Login'
          : url.includes('login.live.com') ? '🔐 MS Account'
          : (url.includes('cloud.microsoft') && !url.includes('login.')) ? '✅ Copilot'
          : '🌐';
        log(`${label}  ${url.substring(0, 100)}`);
      }
    }
  });

  // Navigate
  log('Navigating to M365 Copilot...');
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Navigation: ${e.message.substring(0, 80)}`);
  }
  await page.waitForTimeout(3000);
  currentUrl = page.url();

  // Auto-click Sign In if we landed on the marketing page
  if (!currentUrl.includes('login.')) {
    log('On M365 landing page — auto-clicking "Sign in"...');
    await clickSignInIfOnLandingPage();
    currentUrl = page.url();
  }

  await updateScreenshot();

  log('');
  log('┌──────────────────────────────────────────────────────────┐');
  log('│  Open this URL in YOUR browser:                         │');
  log(`│  👉 http://localhost:${PORT}                                  │`);
  log('│                                                         │');
  log('│  Youʼll see a screenshot of the page + control buttons. │');
  log('│  Use Tab to navigate, Click to activate links/buttons,  │');
  log('│  Type + Enter to fill forms.                            │');
  log('│  When Copilot loads, click "Iʼm logged in".             │');
  log('└──────────────────────────────────────────────────────────┘');
  log('');
  log('Waiting for you to authenticate... (Ctrl+C to abort)');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  log('\nShutting down...');
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
  log('Done.');
  process.exit(0);
});

process.on('SIGTERM', () => process.emit('SIGINT'));

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
