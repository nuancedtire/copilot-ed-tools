#!/usr/bin/env node
/**
 * dom-dump.js — DOM reconnaissance for M365 Copilot chat page
 *
 * Navigates to an authenticated Copilot session, waits for the SPA to render,
 * then dumps the DOM structure of the sidebar, conversation list, and message
 * area. Saves structured output to /tmp/ for analysis.
 *
 * Usage:
 *   node tests/dom-dump.js              # use existing auth profile
 *   node tests/dom-dump.js --chat-url   # navigate to /chat directly
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = '/tmp/playwright-profile';
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TARGET_URL = 'https://m365.cloud.microsoft/chat';

// ── Helpers ──────────────────────────────────────────────────────────────────

function dumpElementTree(el, maxDepth = 4, currentDepth = 0) {
  if (!el || currentDepth > maxDepth) return null;

  const info = {
    tag: el.tagName?.toLowerCase(),
    id: el.id || null,
    className: (typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '').substring(0, 300) || null,
    role: el.getAttribute?.('role') || null,
    ariaLabel: el.getAttribute?.('aria-label') || null,
    ariaLabelledby: el.getAttribute?.('aria-labelledby') || null,
    dataTid: el.getAttribute?.('data-tid') || null,
    dataAutomationid: el.getAttribute?.('data-automationid') || null,
    dataTestid: el.getAttribute?.('data-testid') || null,
    textSnippet: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 200),
    childCount: el.children?.length || 0,
    totalDescendants: el.querySelectorAll?.('*').length || 0,
    rect: null,
  };

  // Bounding box
  if (typeof el.getBoundingClientRect === 'function') {
    try {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        info.rect = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      }
    } catch (e) { /* cross-origin frame? */ }
  }

  // Children (breadth-limit: max 30 per level to avoid huge dumps)
  if (currentDepth < maxDepth && el.children && el.children.length > 0) {
    info.children = Array.from(el.children).slice(0, 30).map(c => dumpElementTree(c, maxDepth, currentDepth + 1));
    if (el.children.length > 30) {
      info.children.push({ _truncated: true, skipped: el.children.length - 30 });
    }
  }

  return info;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Check auth profile
  const authTs = path.join(PROFILE_DIR, '.auth-timestamp');
  if (!fs.existsSync(authTs)) {
    console.log('❌ No auth profile found.');
    console.log('   Run:  node tests/auth-headless.js');
    console.log('   This opens a control page. Log in + MFA, then click "I\'m logged in".');
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
    viewport: { width: 1280, height: 900 },
    bypassCSP: true,
  });

  const page = browser.pages()[0] || await browser.newPage();

  // Track URL changes
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`   🌐 ${frame.url().substring(0, 120)}`);
    }
  });

  // ── Navigate ──────────────────────────────────────────────────────────────
  console.log('🌐 Navigating to M365 Copilot chat...');
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`   Navigation: ${e.message.substring(0, 100)}`);
  }
  await page.waitForTimeout(3000);

  // Auth check
  const initialUrl = page.url();
  if (initialUrl.includes('login.microsoftonline.com') || initialUrl.includes('login.live.com')) {
    console.log('\n⚠️  Redirected to login. Session may have expired.');
    console.log('   Re-run:  node tests/auth-headless.js');
    await page.screenshot({ path: '/tmp/copilot-dom-login.png', fullPage: false });
    console.log('   Screenshot saved to /tmp/copilot-dom-login.png');
    await browser.close();
    process.exit(1);
  }

  console.log(`   URL: ${initialUrl.substring(0, 120)}`);
  console.log(`   Title: ${(await page.title()).substring(0, 120)}`);

  // ── Wait for SPA to render ────────────────────────────────────────────────
  console.log('\n⏳ Waiting for SPA to fully render...');
  const rendered = await page.waitForFunction(() => {
    const nav = document.querySelector('[role="navigation"]');
    const log = document.querySelector('[role="log"]');
    const input = document.querySelector('#m365-chat-input-shared-wrapper');
    const main = document.querySelector('main');
    // Need at least one substantial region to be present
    return !!(nav || log || (input && main));
  }, { timeout: 30000 }).then(() => true).catch(() => false);

  if (rendered) {
    console.log('   ✅ SPA rendered.');
  } else {
    console.log('   ⚠️  Timeout waiting for SPA. Proceeding with whatever loaded...');
  }
  await page.waitForTimeout(3000);

  // ── Screenshot ────────────────────────────────────────────────────────────
  await page.screenshot({ path: '/tmp/copilot-dom-page.png', fullPage: false });
  console.log('📸 Screenshot saved to /tmp/copilot-dom-page.png');

  // ── Strategy 1: High-level region scan ────────────────────────────────────
  console.log('\n=== HIGH-LEVEL REGIONS ===');

  const regions = await page.evaluate(() => {
    const results = [];
    const selectors = [
      { sel: '[role="navigation"]', label: 'role=navigation' },
      { sel: '[role="complementary"]', label: 'role=complementary' },
      { sel: '[role="main"]', label: 'role=main' },
      { sel: '[role="log"]', label: 'role=log' },
      { sel: '[role="list"]', label: 'role=list' },
      { sel: '[role="tree"]', label: 'role=tree' },
      { sel: '[role="region"]', label: 'role=region' },
      { sel: 'main', label: '<main>' },
      { sel: 'nav', label: '<nav>' },
      { sel: 'aside', label: '<aside>' },
      { sel: '#m365-chat-input-shared-wrapper', label: '#m365-chat-input-shared-wrapper' },
      { sel: '[data-testid*="chat"]', label: 'data-testid*=chat' },
      { sel: '[aria-label*="chat" i]', label: 'aria-label*=chat' },
      { sel: '[aria-label*="conversation" i]', label: 'aria-label*=conversation' },
    ];

    for (const { sel, label } of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        results.push({
          label,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: (el.className || '').substring(0, 200),
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          dataTid: el.getAttribute('data-tid') || null,
          dataAutomationid: el.getAttribute('data-automationid') || null,
          childCount: el.children.length,
          totalDescendants: el.querySelectorAll('*').length,
          textSnippet: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 200),
          rect: (() => {
            try {
              const r = el.getBoundingClientRect();
              return r.width > 0 ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null;
            } catch (e) { return null; }
          })(),
          // Look for any interactive children that might be conversation items
          clickableChildren: el.querySelectorAll('a, button, [role="button"], [role="link"], [role="listitem"], [role="treeitem"], [role="option"], [tabindex]').length,
        });
      }
    }

    // Also find ALL elements with data-tid (Fluent UI test IDs)
    const tidElements = document.querySelectorAll('[data-tid]');
    const tidMap = {};
    for (const el of tidElements) {
      const tid = el.getAttribute('data-tid');
      if (!tidMap[tid]) tidMap[tid] = 0;
      tidMap[tid]++;
    }
    const tidSummary = Object.entries(tidMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tid, count]) => ({ tid, count }));

    return { regions: results, tidSummary };
  });

  console.log(`Found ${regions.regions.length} region elements:`);
  for (const r of regions.regions) {
    const dim = r.rect ? ` ${r.rect.width}x${r.rect.height}@(${r.rect.left},${r.rect.top})` : '';
    console.log(`   ${r.label.padEnd(30)} ${r.tag}#${r.id || '(no-id)'}  children:${r.childCount}  desc:${r.totalDescendants}  clickable:${r.clickableChildren}${dim}`);
    if (r.ariaLabel) console.log(`     aria-label: "${r.ariaLabel.substring(0, 100)}"`);
    if (r.textSnippet) console.log(`     text: "${r.textSnippet.substring(0, 120)}"`);
  }

  if (regions.tidSummary.length > 0) {
    console.log(`\n   data-tid summary (top ${regions.tidSummary.length}):`);
    for (const t of regions.tidSummary) {
      console.log(`     ${t.tid.padEnd(40)} x${t.count}`);
    }
  }

  // ── Strategy 2: Sidebar deep dive ─────────────────────────────────────────
  console.log('\n=== SIDEBAR DEEP DIVE ===');

  const sidebarInfo = await page.evaluate(() => {
    // Try to identify the sidebar by looking for navigation regions with list items
    const candidates = [];

    // Look for any container that has many similar-looking child items with text
    // (heuristic for conversation lists)
    const allDivs = document.querySelectorAll('div, nav, aside, section');
    for (const el of allDivs) {
      const children = Array.from(el.children);
      if (children.length < 3 || children.length > 500) continue;

      // Check if children share similar structure (same tag, similar class)
      const childTags = children.map(c => c.tagName);
      const uniqueTags = new Set(childTags);
      if (uniqueTags.size > 3) continue; // too varied

      // Check if these children contain text
      const withText = children.filter(c => (c.textContent || '').trim().length > 5);
      if (withText.length < children.length * 0.6) continue;

      // Check rect: sidebar is typically on the left, narrower than the page
      let rect = null;
      try {
        const r = el.getBoundingClientRect();
        rect = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      } catch (e) { /* ignore */ }

      // Heuristic: sidebar width typically 200-400px
      if (rect && rect.width >= 200 && rect.width <= 450 && children.length >= 3) {
        candidates.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: (el.className || '').substring(0, 200),
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          childCount: children.length,
          rect,
          // Sample first 3 children's structure
          sampleChildren: children.slice(0, 5).map(c => ({
            tag: c.tagName.toLowerCase(),
            className: (c.className || '').substring(0, 200),
            role: c.getAttribute('role') || null,
            dataTid: c.getAttribute('data-tid') || null,
            ariaLabel: c.getAttribute('aria-label') || null,
            textSnippet: (c.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 150),
            // Does it contain a clickable?
            hasClickable: !!(c.querySelector('a, button, [role="button"]')),
            // Look for timestamp-like text
            hasTimestamp: /\b(\d{1,2}[:\/]\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|yesterday|today|just now|min|hour|day|week|month|ago|am|pm)\b/i.test(c.textContent || ''),
          })),
        });
      }
    }

    return candidates;
  });

  if (sidebarInfo.length > 0) {
    console.log(`Found ${sidebarInfo.length} sidebar-like containers:`);
    for (const s of sidebarInfo) {
      console.log(`\n   ${s.tag}#${s.id || '(no-id)'}  role="${s.role}"  ${s.childCount} children  ${s.rect?.width}x${s.rect?.height}@${s.rect?.left}`);
      if (s.ariaLabel) console.log(`   aria-label: "${s.ariaLabel}"`);
      console.log(`   class: "${s.className.substring(0, 150)}"`);
      console.log(`   Sample children:`);
      for (const c of s.sampleChildren) {
        console.log(`     <${c.tag}> role="${c.role}" data-tid="${c.dataTid || ''}" hasClickable:${c.hasClickable} hasTimestamp:${c.hasTimestamp}`);
        console.log(`       text: "${c.textSnippet.substring(0, 130)}"`);
      }
    }
  } else {
    console.log('⚠️  No sidebar-like containers found by heuristic.');
    console.log('   Will dump all large region children instead...');
  }

  // ── Strategy 3: Message area dump ─────────────────────────────────────────
  console.log('\n=== MESSAGE AREA DUMP ===');

  const messageInfo = await page.evaluate(() => {
    // Find the message container
    const log = document.querySelector('[role="log"]');
    const main = document.querySelector('main');
    const chatTestId = document.querySelector('[data-testid*="chat"]');

    const container = log || chatTestId || main;
    if (!container) return { found: false, bodySnippet: document.body ? document.body.innerText.substring(0, 500) : 'NO BODY' };

    // Get direct children that look like message bubbles
    const directChildren = Array.from(container.children).slice(0, 30);
    const bubbles = [];

    for (const child of directChildren) {
      const text = (child.textContent || '').trim();
      if (text.length < 3) continue;

      const cn = (child.className || '');
      const role = child.getAttribute('role') || '';
      const ariaLabel = child.getAttribute('aria-label') || '';
      const dataTid = child.getAttribute('data-tid') || '';

      // Heuristic classification
      let likelyRole = 'unknown';
      const combined = (cn + ' ' + role + ' ' + ariaLabel + ' ' + dataTid).toLowerCase();
      if (combined.includes('user') || combined.includes('you') || combined.includes('human')) {
        likelyRole = 'user';
      } else if (combined.includes('assistant') || combined.includes('bot') || combined.includes('copilot') || combined.includes('ai') || combined.includes('response')) {
        likelyRole = 'assistant';
      }

      // Alignment check: user messages often right-aligned, assistant left-aligned
      let alignment = 'unknown';
      try {
        const cs = window.getComputedStyle(child);
        if (cs.marginLeft && parseFloat(cs.marginLeft) > 60) alignment = 'right-ish';
        else if (cs.marginRight && parseFloat(cs.marginRight) > 60) alignment = 'left-ish';
        else if (cs.alignSelf === 'flex-end') alignment = 'right (flex-end)';
        else if (cs.alignSelf === 'flex-start') alignment = 'left (flex-start)';
        else if (cs.justifyContent === 'flex-end') alignment = 'right (flex-end container)';
        else if (cs.justifyContent === 'flex-start') alignment = 'left (flex-start container)';
      } catch (e) { /* ignore */ }

      bubbles.push({
        tag: child.tagName.toLowerCase(),
        className: cn.substring(0, 250),
        role: role || null,
        ariaLabel: ariaLabel || null,
        dataTid: dataTid || null,
        likelyRole,
        alignment,
        textSnippet: text.replace(/\s+/g, ' ').substring(0, 300),
        childCount: child.children.length,
        // Check for markdown/code blocks (common in Copilot responses)
        hasCodeBlock: !!child.querySelector('pre, code'),
        hasTable: !!child.querySelector('table'),
        hasList: !!child.querySelector('ul, ol'),
      });
    }

    return {
      found: true,
      containerTag: container.tagName.toLowerCase(),
      containerId: container.id || null,
      containerRole: container.getAttribute('role') || null,
      containerChildCount: container.children.length,
      bubbles,
    };
  });

  if (messageInfo.found) {
    console.log(`   Container: <${messageInfo.containerTag}> id="${messageInfo.containerId}" role="${messageInfo.containerRole}"  ${messageInfo.containerChildCount} children`);
    console.log(`   Message bubbles found: ${messageInfo.bubbles.length}`);
    for (const b of messageInfo.bubbles) {
      console.log(`\n   --- Bubble (${b.likelyRole}, ${b.alignment}) ---`);
      console.log(`   <${b.tag}> class="${b.className.substring(0, 120)}"`);
      if (b.role) console.log(`   role="${b.role}"`);
      if (b.ariaLabel) console.log(`   aria-label="${b.ariaLabel.substring(0, 120)}"`);
      if (b.dataTid) console.log(`   data-tid="${b.dataTid}"`);
      console.log(`   hasCodeBlock:${b.hasCodeBlock} hasTable:${b.hasTable} hasList:${b.hasList}`);
      console.log(`   text: "${b.textSnippet.substring(0, 200)}"`);
    }
  } else {
    console.log('   ❌ No message container found.');
    console.log(`   Body text preview: "${(messageInfo.bodySnippet || '').substring(0, 300)}"`);
  }

  // ── Strategy 4: Full DOM tree dump ─────────────────────────────────────────
  console.log('\n=== SAVING FULL DOM TREE ===');

  const domTree = await page.evaluate(() => {
    // Find the main app root
    const root = document.getElementById('root') ||
                document.querySelector('[role="application"]') ||
                document.body;

    function simpleTree(el, depth) {
      if (!el || depth > 5) return null;
      if (el.nodeType !== 1) return null; // only elements

      const node = {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        cls: (typeof el.className === 'string' ? el.className : '').substring(0, 250) || undefined,
        role: el.getAttribute('role') || undefined,
        aria: el.getAttribute('aria-label') || undefined,
        tid: el.getAttribute('data-tid') || undefined,
        testid: el.getAttribute('data-testid') || undefined,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120) || undefined,
      };

      // Remove undefined keys
      Object.keys(node).forEach(k => { if (node[k] === undefined) delete node[k]; });

      if (depth < 5 && el.children.length > 0) {
        node.children = Array.from(el.children).slice(0, 25).map(c => simpleTree(c, depth + 1)).filter(Boolean);
        if (el.children.length > 25) node._more = el.children.length - 25;
      }

      return node;
    }

    return simpleTree(root, 0);
  });

  fs.writeFileSync('/tmp/copilot-dom-tree.json', JSON.stringify(domTree, null, 2));
  console.log('   ✅ Saved to /tmp/copilot-dom-tree.json');

  // ── Strategy 5: Raw HTML snippet ──────────────────────────────────────────
  console.log('\n=== SAVING RAW HTML SNIPPET ===');

  const htmlSnippet = await page.evaluate(() => {
    const body = document.body;
    if (!body) return 'NO BODY';

    // Try to get just the app container
    const app = document.getElementById('root') ||
               document.querySelector('[role="application"]') ||
               body;

    return app.outerHTML.substring(0, 500000);
  });

  fs.writeFileSync('/tmp/copilot-dom-body.html', htmlSnippet);
  console.log(`   ✅ Saved ${(htmlSnippet.length / 1024).toFixed(0)} KB to /tmp/copilot-dom-body.html`);

  // ── Summary & selector recommendations ────────────────────────────────────
  console.log('\n=== SUMMARY & SELECTOR RECOMMENDATIONS ===');

  // Check for known patterns
  const selectorCheck = await page.evaluate(() => {
    const results = {};

    const checks = [
      // Navigation / sidebar
      '[role="navigation"]',
      'nav',
      'aside',
      '[role="complementary"]',
      '[aria-label*="chat" i]',
      '[aria-label*="conversation" i]',
      '[aria-label*="history" i]',
      // Conversation items
      '[role="listitem"]',
      '[role="treeitem"]',
      '[role="option"]',
      // Message area
      '[role="log"]',
      'main',
      '[data-testid*="chat"]',
      // Input
      '#m365-chat-input-shared-wrapper',
      '[contenteditable="true"]',
      // Generic Fluent UI
      '[data-tid]',
    ];

    for (const sel of checks) {
      const els = document.querySelectorAll(sel);
      results[sel] = els.length;
    }

    // Also check for elements with specific text patterns
    const bodyText = document.body ? document.body.innerText : '';
    results._bodyTextLength = bodyText.length;
    results._hasClinicalContent = /(?:presenting complaint|past medical|discharge|clerking|diagnosis|examination|investigations|impression)/i.test(bodyText);

    return results;
  });

  console.log('   Selector counts:');
  for (const [sel, count] of Object.entries(selectorCheck)) {
    if (sel.startsWith('_')) continue;
    if (count > 0) {
      console.log(`     ${sel.padEnd(45)} x${count}`);
    }
  }
  console.log(`     bodyText.length: ${selectorCheck._bodyTextLength}`);
  console.log(`     hasClinicalContent: ${selectorCheck._hasClinicalContent}`);

  // ── Done ───────────────────────────────────────────────────────────────────
  await browser.close();
  console.log('\n✅ DOM reconnaissance complete.');
  console.log('   Artifacts:');
  console.log('     /tmp/copilot-dom-tree.json   — structured DOM tree');
  console.log('     /tmp/copilot-dom-body.html   — raw HTML snippet');
  console.log('     /tmp/copilot-dom-page.png    — screenshot');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\nInterrupted.');
  process.exit(0);
});
