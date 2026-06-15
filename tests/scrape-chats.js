#!/usr/bin/env node
/**
 * scrape-chats.js — Extract all Copilot conversations and identify patient encounters
 *
 * Launches headless Chromium with saved auth profile, extracts all conversations
 * from the M365 Copilot sidebar, clicks through each one to capture messages,
 * classifies patient encounters, and saves structured output to JSON.
 *
 * Usage:
 *   node tests/scrape-chats.js                    # full scrape
 *   node tests/scrape-chats.js --max 5            # limit to 5 conversations
 *   node tests/scrape-chats.js --patients-only    # only patient encounters
 *   node tests/scrape-chats.js --dry-run          # sidebar scan only, no click-through
 *
 * Requires auth profile. Run first:
 *   node tests/auth-headless.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = '/tmp/playwright-profile';
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TARGET_URL = 'https://m365.cloud.microsoft/chat';
const OUTPUT_PATH = '/tmp/copilot-chat-export.json';

const args = process.argv.slice(2);
const MAX_CONVERSATIONS = parseInt(args[args.indexOf('--max') + 1] || '0', 10) || Infinity;
const PATIENTS_ONLY = args.includes('--patients-only');
const DRY_RUN = args.includes('--dry-run');

// ── Patient encounter classification ────────────────────────────────────────

const CLINICAL_SECTIONS = [
  'presenting complaint', 'history of presenting', 'past medical history',
  'pmh', 'drug history', 'social history', 'examination', 'observations',
  'investigations', 'impression', 'diagnosis', 'plan', 'disposition',
  'pc:', 'hpc:', 'pmhx:', 'o/e:', 'imp:', 'plan:', 'dh:', 'sh:', 'fh:',
  'on examination', 'vital signs', 'management', 'treatment given',
  'follow-up', 'safety-netting', 'discharge advice', 'return to ed',
  'reason for attendance', 'clinical narrative', 'discharge summary',
  'ed clerking', 'rcem-compliant', 'coroner-defensible',
];

const PROMPT_MARKERS = [
  'ed clerking', 'discharge summary', 'senior ed registrar',
  'phase 1: safety check', 'phase 2: discharge summary',
  'safety check', 'you are assisting an nhs emergency department',
  'cerner', 'discharge summaries for cerner', 'ed documentation',
  'rcem', 'coroner',
];

// Match age + gender: "75 yrs, female", "89M", "85-year-old lady", "75yr female"
const AGE_GENDER_RE = /\b(\d{1,3})\s*(?:-?\s*(?:year|yr|y|yo|y\.o)s?\.?)?\s*,?\s*(?:old)?\s*,?\s*(male|female|man|woman|gentleman|lady|m|f)\b/i;
// Gender-first: "Female, Date of Birth: ... Age: 85"
const GENDER_AGE_DOB = /(?:gender\s*:\s*)?(male|female)\b.*?(?:date\s*of\s*birth|dob).*?(?:age\s*:\s*)?(\d{1,3})\s*(?:yr|year|y)/i;
// Age from "Age: 85 years" or "Age: 85" near a gender mention
const AGE_LINE_RE = /age\s*:\s*(\d{1,3})\s*(?:yr|year|y)/i;
const GENDER_LINE_RE = /gender\s*:\s*(male|female)/i;

function normalizeGender(g) {
  const lower = (g || '').toLowerCase();
  if (lower === 'm' || lower === 'male' || lower === 'man' || lower === 'gentleman') return 'male';
  if (lower === 'f' || lower === 'female' || lower === 'woman' || lower === 'lady') return 'female';
  return lower;
}

function extractAgeGender(title, allText, allTextLower) {
  // Priority 1: Look in the title first (most reliable)
  // Try keyword patterns: "75 yrs, female", "89M", "85-year-old lady"
  const titleMatch = title.match(AGE_GENDER_RE);
  if (titleMatch) {
    const age = parseInt(titleMatch[1], 10);
    const gender = normalizeGender(titleMatch[2]);
    // Exclude false positives: dates (e.g., "27/Apr/1941" would match age=27)
    // Check context — if preceded by a date pattern, skip
    const matchIdx = titleMatch.index;
    const beforeMatch = title.substring(Math.max(0, matchIdx - 4), matchIdx);
    const afterMatch = title.substring(matchIdx + titleMatch[0].length, matchIdx + titleMatch[0].length + 12);
    const isDateContext = /\/[A-Za-z]/.test(beforeMatch + afterMatch) || /\b\d{1,2}\/\w{3}\//i.test(title);
    if (age >= 1 && age <= 110 && !isDateContext) {
      return { text: `${age}yr ${gender}`, age: String(age), gender };
    }
  }

  // Priority 2: Full text search — "89M", "45F" etc
  const fullMatch = allTextLower.match(AGE_GENDER_RE);
  if (fullMatch) {
    const age = parseInt(fullMatch[1], 10);
    const gender = normalizeGender(fullMatch[2]);
    if (age >= 1 && age <= 110) {
      return { text: `${age}yr ${gender}`, age: String(age), gender };
    }
  }

  // Priority 3: Gender + DOB + Age pattern (from structured medical data)
  const dobMatch = allTextLower.match(GENDER_AGE_DOB);
  if (dobMatch) {
    const age = parseInt(dobMatch[2], 10);
    const gender = normalizeGender(dobMatch[1]);
    if (age >= 1 && age <= 110) {
      return { text: `${age}yr ${gender}`, age: String(age), gender };
    }
  }

  // Priority 4: "Age: 85" combined with a gender line nearby
  const ageLineMatch = allTextLower.match(AGE_LINE_RE);
  const genderLineMatch = allText.match(GENDER_LINE_RE);
  if (ageLineMatch && genderLineMatch) {
    const age = parseInt(ageLineMatch[1], 10);
    const gender = normalizeGender(genderLineMatch[1]);
    if (age >= 1 && age <= 110) {
      return { text: `${age}yr ${gender}`, age: String(age), gender };
    }
  }

  // Priority 5: Gender line only (no age found)
  if (genderLineMatch) {
    const gender = normalizeGender(genderLineMatch[1]);
    return { text: `${gender} (no age)`, age: null, gender };
  }

  return null;
}

function classifyConversation(conv) {
  const allText = [
    conv.title || '',
    ...(conv.messages || []).map(m => m.content || ''),
  ].join('\n');

  const lowerAll = allText.toLowerCase();
  let score = 0;
  const details = {
    ageGender: null,
    clinicalSections: [],
    promptMarkers: [],
  };

  // 1. Age/gender extraction (worth 3 points if found)
  const agResult = extractAgeGender(conv.title || '', allText, lowerAll);
  if (agResult) {
    score += 3;
    details.ageGender = agResult.text;
  }

  // Check for Gender: line as fallback indicator
  if (!details.ageGender) {
    const genderMatch = allText.match(GENDER_LINE_RE);
    if (genderMatch) {
      score += 1;
      details.genderFromLine = genderMatch[1];
    }
  }

  // 2. Clinical section headers (1 point each, capped at 8)
  for (const section of CLINICAL_SECTIONS) {
    if (lowerAll.includes(section)) {
      details.clinicalSections.push(section);
    }
  }
  score += Math.min(details.clinicalSections.length, 8);

  // 3. Prompt markers (2 points each, capped at 6)
  for (const marker of PROMPT_MARKERS) {
    if (lowerAll.includes(marker)) {
      details.promptMarkers.push(marker);
    }
  }
  score += Math.min(details.promptMarkers.length * 2, 6);

  // 4. Structured clinical content bonus: count lines starting with clinical headers
  const lines = allText.split('\n').map(l => l.trim().toLowerCase());
  const headerLineCount = lines.filter(l =>
    /^(presenting complaint|hpc|history|examination|impression|plan|diagnosis|observations|investigations|treatment|disposition|follow-up|past medical|drug history|social history|family history|o\/e|ix|pmh|dh|sh|fh|cvs|neuro|abdo|chest|mSK|skin|bloods|imaging|ecg|plan)/i.test(l)
  ).length;
  score += Math.min(headerLineCount, 5) * 0.25;

  const isPatientEncounter = score >= 2;

  // Extract patient info
  let patientInfo = null;
  if (isPatientEncounter && agResult) {
    patientInfo = {};
    if (agResult.age) patientInfo.age = agResult.age;
    if (agResult.gender) patientInfo.gender = agResult.gender;
    if (!patientInfo.gender && details.genderFromLine) {
      patientInfo.gender = normalizeGender(details.genderFromLine);
    }

    // Try to find complaint from title or PC/HPC
    const complaintMatch = allText.match(/(?:c\/o|presenting complaint|presenting problem|pc)\s*:?\s*([^\n]{5,120})/i);
    if (complaintMatch) {
      patientInfo.complaint = complaintMatch[1].trim();
    } else if (conv.title && conv.title.length > 10) {
      // Clean up title for complaint use
      const cleanTitle = conv.title.replace(/^(?:ED Clerking|Discharge Summary|Gender:|You are|Senior ED)\s*/i, '').trim();
      patientInfo.complaint = cleanTitle.substring(0, 120) || conv.title.substring(0, 120);
    }
  } else if (isPatientEncounter && details.genderFromLine) {
    patientInfo = { gender: normalizeGender(details.genderFromLine) };
  }

  return {
    isPatientEncounter,
    score: Math.round(score * 100) / 100,
    details,
    patientInfo,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(`[scrape] ${msg}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Auth check
  const authTs = path.join(PROFILE_DIR, '.auth-timestamp');
  if (!fs.existsSync(authTs)) {
    console.log('❌ No auth profile found.');
    console.log('   Run:  node tests/auth-headless.js');
    process.exit(1);
  }
  const authAge = Math.round((Date.now() - fs.statSync(authTs).mtimeMs) / 1000 / 60);
  log(`Auth profile: ${authAge} min old`);

  // Launch
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

  // Track URL
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url.includes('login.microsoftonline.com')) {
        log('⚠️  Auth redirect detected!');
      }
    }
  });

  // ── Navigate ──────────────────────────────────────────────────────────────
  log('Navigating to Copilot...');
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`Navigation: ${e.message.substring(0, 100)}`);
  }
  await page.waitForTimeout(4000);

  // Auth check
  const url = page.url();
  if (url.includes('login.microsoftonline.com') || url.includes('login.live.com')) {
    console.log('\n⚠️  Redirected to login. Session expired.');
    console.log('   Re-run:  node tests/auth-headless.js');
    await browser.close();
    process.exit(1);
  }
  log(`URL: ${url.substring(0, 100)}`);

  // Wait for SPA
  await page.waitForSelector('[role="navigation"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // ── Extract conversation list ──────────────────────────────────────────────
  log('Extracting conversation list...');

  const conversationList = await page.evaluate(() => {
    const nav = document.querySelector('[role="navigation"]');
    if (!nav) return { error: 'no-navigation' };

    // Find the scrollable container with conversation items
    // It's the div with many direct children, each containing a button
    const allDivs = nav.querySelectorAll('div');
    let container = null;

    for (const d of allDivs) {
      const children = Array.from(d.children);
      if (children.length >= 5 && children.length <= 300) {
        const allDivs = children.every(c => c.tagName === 'DIV');
        const buttons = d.querySelectorAll('button');
        const buttonRatio = buttons.length / children.length;
        if (allDivs && buttonRatio > 0.5) {
          container = d;
          break;
        }
      }
    }

    if (!container) return { error: 'no-container' };

    // Collect conversation items
    const items = [];
    for (const child of container.children) {
      const button = child.querySelector('button');
      if (!button) continue;

      const ariaLabel = button.getAttribute('aria-label') || '';
      const textContent = (child.textContent || '').trim();
      if (ariaLabel.length < 2) continue;

      // Look for timestamp
      const timeMatch = textContent.match(
        /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}|Yesterday|Today|\d+\s*(?:min|hour|day|week|month|yr|year)s?\s+ago|Just now)/i
      );

      items.push({
        ariaLabel: ariaLabel.substring(0, 300),
        // Also check for data attributes
        timestampSnippet: timeMatch ? timeMatch[0] : null,
      });
    }

    return { items, containerChildCount: container.children.length };
  });

  if (conversationList.error) {
    console.log(`❌ Could not find conversation list: ${conversationList.error}`);
    await page.screenshot({ path: '/tmp/scrape-error.png', fullPage: false });
    console.log('   Screenshot saved to /tmp/scrape-error.png');
    await browser.close();
    process.exit(1);
  }

  // Process ALL items (don't dedup by title — many conversations share
  // the same system-prompt title but are different patient encounters).
  // We'll deduplicate by conversation URL after clicking.
  const allItems = conversationList.items;
  log(`Found ${allItems.length} sidebar items — will deduplicate by conversation URL`);
  const allConversations = [];
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const totalToProcess = Math.min(allItems.length, MAX_CONVERSATIONS);
  const seenUrls = new Set();

  log(`Processing ${totalToProcess} sidebar items...`);

  for (let i = 0; i < totalToProcess; i++) {
    const convMeta = allItems[i];

    // Check for auth redirect periodically
    if (i > 0 && i % 10 === 0) {
      const currentUrl = page.url();
      if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('login.live.com')) {
        log('⚠️  Session expired mid-scrape. Saving collected data...');
        break;
      }
    }

    try {
      // Click the conversation in the sidebar by direct index
      const clicked = await page.evaluate((index) => {
        const nav = document.querySelector('[role="navigation"]');
        if (!nav) return { error: 'no-nav' };

        // Find the container with conversation items (many div children with buttons)
        const allDivs = nav.querySelectorAll('div');
        let container = null;
        for (const d of allDivs) {
          const children = Array.from(d.children);
          if (children.length >= 5 && children.length <= 300) {
            const allDivs = children.every(c => c.tagName === 'DIV');
            const buttons = d.querySelectorAll('button');
            if (allDivs && buttons.length / children.length > 0.5) {
              container = d;
              break;
            }
          }
        }
        if (!container) return { error: 'no-container' };

        // Click by direct child index (all items, including duplicates)
        if (index >= container.children.length) return { error: 'index-out-of-range', max: container.children.length };
        const button = container.children[index].querySelector('button');
        if (!button) return { error: 'no-button' };
        button.click();
        return { clicked: true, ariaLabel: button.getAttribute('aria-label')?.substring(0, 200) };
      }, i);

      if (clicked.error) {
        log(`  [${i}] ❌ Click failed: ${clicked.error}`);
        errorCount++;
        continue;
      }

      log(`  [${i}/${totalToProcess}] "${clicked.ariaLabel?.substring(0, 80)}"`);

      // Wait for messages to load
      await page.waitForTimeout(3000);

      // ── URL-based dedup ──────────────────────────────────────────────────
      const convUrl = page.url();
      const urlMatch = convUrl.match(/\/conversation\/([a-f0-9-]+)/i);
      const convId = urlMatch ? urlMatch[1] : convUrl;

      if (seenUrls.has(convId)) {
        log(`    ⏭️  Duplicate URL — skipping`);
        skippedCount++;
        continue;
      }
      seenUrls.add(convId);

      // Wait for message container
      await page.waitForSelector('[data-testid="m365-chat-llm-web-ui-chat-message"]', {
        timeout: 10000,
      }).catch(() => {
        log(`    ⚠️  No messages loaded (timeout)`);
      });
      await page.waitForTimeout(1000);

      // ── Expand all collapsed content ─────────────────────────────────────
      // Copilot collapses code blocks behind "Show more lines" / "Plain Text"
      // buttons. Click them all so innerText captures the full clinical output.
      const expandedCount = await page.evaluate(() => {
        let count = 0;
        // Find all buttons that look like "Show more lines" expanders
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          const text = (btn.textContent || '').trim();
          // Click any "Show more lines" or similar expand buttons
          if (/show more( lines)?/i.test(text) ||
              /expand/i.test(text) ||
              /view more/i.test(text)) {
            try { btn.click(); count++; } catch(e) {}
          }
        }
        return count;
      });

      if (expandedCount > 0) {
        await page.waitForTimeout(800); // let animations settle
      }

      // ── Extract messages ──────────────────────────────────────────────────
      const messages = await page.evaluate(() => {
        // Strip Copilot UI boilerplate from text
        function cleanText(text) {
          return text
            .replace(/^(?:Plain Text|Rich Text|Show more lines|Show less|Show more|Copilot said:\s*|You said:\s*|Reasoning completed in \d+ steps?)\s*/gim, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }

        const result = [];

        // User messages
        const userQuestions = document.querySelectorAll('[data-testid="chatQuestion"]');
        for (const q of userQuestions) {
          const output = q.querySelector('[data-testid="chatOutput"]');
          // Use textContent to capture full content (innerText hides collapsed sections)
          const text = output ? output.textContent.trim() : q.textContent.trim();
          if (text.length > 5) {
            result.push({ role: 'user', content: text });
          }
        }

        // Assistant messages — use textContent on markdown-reply to capture
        // hidden/collapsed content that innerText misses
        const assistantMsgs = document.querySelectorAll('[data-testid="copilot-message-div"]');
        for (const a of assistantMsgs) {
          // Collect from markdown-reply elements (use textContent!)
          const replies = a.querySelectorAll('[data-testid="markdown-reply"]');
          for (const reply of replies) {
            const text = reply.textContent.trim(); // NOT innerText — captures collapsed content
            const cleaned = cleanText(text);
            if (cleaned.length > 5) {
              result.push({ role: 'assistant', content: cleaned });
            }
          }

          // Also check for code blocks that might contain clinical output
          // (Copilot wraps some outputs in code-viewer components)
          const codeBlocks = a.querySelectorAll('pre, code');
          for (const code of codeBlocks) {
            const text = code.textContent.trim();
            const cleaned = cleanText(text);
            // Only include if it has substantial clinical-looking content
            // and isn't just UI labels
            if (cleaned.length > 100 &&
                !/^(?:Plain Text|Rich Text|Show more|Show less)$/i.test(cleaned)) {
              result.push({ role: 'assistant', content: cleaned });
            }
          }
        }

        // Fallback: if no structured messages found, try the message list
        if (result.length === 0) {
          const messageEls = document.querySelectorAll('[data-testid="m365-chat-llm-web-ui-chat-message"]');
          for (const el of messageEls) {
            const isUser = !!el.querySelector('[data-testid="chatQuestion"]');
            const isAssistant = !!el.querySelector('[data-testid="copilot-message-div"]');
            const role = isUser ? 'user' : (isAssistant ? 'assistant' : 'unknown');
            const text = el.textContent.trim();
            if (text.length > 5) {
              result.push({ role, content: text.substring(0, 10000) });
            }
          }
        }

        return result;
      });

      // Skip empty conversations
      if (messages.length === 0) {
        log(`    ⚠️  No messages — skipping`);
        skippedCount++;
        continue;
      }

      // Build conversation object
      const conversation = {
        idx: i,
        title: convMeta.ariaLabel,
        sidebarPreview: convMeta.timestampSnippet,
        url: page.url(),
        messages,
        messageCount: messages.length,
      };

      // Classify
      const classification = classifyConversation(conversation);
      conversation.isPatientEncounter = classification.isPatientEncounter;
      conversation.classificationScore = classification.score;
      conversation.classificationDetails = classification.details;
      conversation.patientInfo = classification.patientInfo;

      // Skip non-patient if requested
      if (PATIENTS_ONLY && !conversation.isPatientEncounter) {
        log(`    ⏭️  Non-patient — skipping`);
        continue;
      }

      allConversations.push(conversation);
      processedCount++;

      const label = conversation.isPatientEncounter
        ? `🏥 PATIENT (score:${classification.score}) ${classification.patientInfo?.age || ''}${classification.patientInfo?.gender || ''}`
        : `💬 non-clinical (score:${classification.score})`;
      log(`    ${label}`);

    } catch (e) {
      log(`  [${i}] ❌ Error: ${e.message.substring(0, 100)}`);
      errorCount++;
      // Try to recover — navigate back if needed
      try {
        if (page.url().includes('login.')) break;
      } catch (_) { /* ignore */ }
    }
  }

  // ── Assemble output ────────────────────────────────────────────────────────
  const patientEncounters = allConversations.filter(c => c.isPatientEncounter);

  const output = {
    exportedAt: new Date().toISOString(),
    sourceUrl: TARGET_URL,
    totalSidebarItems: conversationList.containerChildCount,
    processed: totalToProcess,
    uniqueByUrl: seenUrls.size,
    extracted: allConversations.length,
    patientEncounters: patientEncounters.length,
    nonPatientChats: allConversations.length - patientEncounters.length,
    skippedDuplicate: skippedCount,
    errors: errorCount,
    conversations: allConversations,
  };

  // ── Write output ───────────────────────────────────────────────────────────
  const outputJson = JSON.stringify(output, null, 2);
  fs.writeFileSync(OUTPUT_PATH, outputJson);
  log(`\n✅ Output written to ${OUTPUT_PATH} (${(outputJson.length / 1024).toFixed(0)} KB)`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('  EXPORT COMPLETE');
  console.log('═══════════════════════════════════════');
  console.log(`  Total sidebar items:  ${conversationList.containerChildCount}`);
  console.log(`  Processed:            ${totalToProcess}`);
  console.log(`  Unique (by URL):      ${seenUrls.size}`);
  console.log(`  Extracted:            ${output.extracted}`);
  console.log(`  Patient encounters:   ${output.patientEncounters}`);
  console.log(`  Non-patient chats:    ${output.nonPatientChats}`);
  console.log(`  Skipped (duplicate):  ${skippedCount}`);
  console.log(`  Errors:               ${errorCount}`);
  console.log(`  Output:               ${OUTPUT_PATH}`);
  console.log('═══════════════════════════════════════\n');

  // ── Auto-generate browser HTML ────────────────────────────────────────────
  try {
    const { execSync } = require('child_process');
    const buildScript = path.join(__dirname, 'build-browser.js');
    if (fs.existsSync(buildScript)) {
      execSync(`node "${buildScript}"`, { stdio: 'pipe', timeout: 10000 });
    }
  } catch (e) {
    log(`⚠️  Browser HTML generation skipped: ${e.message.substring(0, 80)}`);
  }

  if (patientEncounters.length > 0) {
    console.log('Patient encounters:');
    for (const enc of patientEncounters) {
      const info = enc.patientInfo
        ? `${enc.patientInfo.age}yr ${enc.patientInfo.gender} — ${enc.patientInfo.complaint || '(no complaint extracted)'}`
        : '(no patient info extracted)';
      console.log(`  🏥 [${enc.idx}] ${enc.title.substring(0, 80)}`);
      console.log(`      ${info}`);
      console.log(`      ${enc.messageCount} messages, score: ${enc.classificationScore}`);
    }
  }

  await browser.close();
  log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\nInterrupted. Partial results may have been saved.');
  process.exit(0);
});
