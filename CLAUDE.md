# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Copilot ED Tools is a Chrome/Edge Manifest V3 browser extension that injects clinical documentation prompts into Microsoft Copilot for NHS ED clinicians. Vanilla JavaScript/CSS/JSON — no build step, no bundler, no package manager.

## Commands

```bash
# Syntax-check JavaScript (no runtime, just parse)
node --check content.js
node --check prompts.js

# Validate manifest JSON
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"

# Bump version (must be on clean main branch, generates changelog + tag)
./scripts/bump-version.sh 0.3.0

# Manual test: load extension unpacked from repo root in chrome://extensions/
```

## Architecture

**Load order matters.** `manifest.json` declares `content_scripts.js` as `["prompts.js", "content.js"]` — prompts must load first because `content.js` reads from the global `window.COPILOT_ED_TOOLS_PROMPTS` that `prompts.js` sets.

**`manifest.json`** is the source of truth for version. It declares MV3, `storage` permission, host permissions for `m365.cloud.microsoft`, `copilot.cloud.microsoft`, and `api.github.com` (update check). Content scripts run at `document_idle` on both Copilot domains.

**`prompts.js`** is an IIFE that sets `window.COPILOT_ED_TOOLS_PROMPTS` with:
- `commands[]` — array of `{ id, label, collapsedLabel, prompt }` objects (currently: `clerking` and `discharge`)
- `build(command)` — returns the prompt string (currently a simple getter, exists for future extensibility)

Both prompts follow a two-phase design: (1) information collection — be "pushy" about missing source material, (2) structured output in a specific format. Prompts are safety-critical clinical content; do not modify unless specifically asked.

**`content.js`** is an IIFE (`"use strict"`) that:
- Reads prompts from the global, then inits on DOM ready
- **Button anchoring:** layered fallback — `#m365-chat-input-shared-wrapper` → visible contenteditable near bottom → chat container (`[data-testid*="chat"]`, `[role="log"]`, `main`) → floating FAB in bottom-right
- **Composer observation:** `MutationObserver` on `document.body` (debounced 200ms) re-anchors button on DOM changes
- **Route observation:** separate `MutationObserver` detects SPA URL changes, cleans up stale popover, re-anchors
- **Popover:** built on toggle — opens a `role="menu"` popover with keyboard nav (arrow keys, Enter, Escape, Tab trap, number shortcuts 1/2), focus management, click-outside close
- **Global shortcut:** `Alt+E` or `Ctrl+Shift+E` toggles popover
- **Command execution:** inserts prompt text into Copilot's contenteditable via `document.execCommand("insertText")`, finds send button via `elementFromPoint`, then starts a MutationObserver to collapse the sent prompt bubble cosmetically
- **Update check:** daily GitHub releases API poll via `chrome.storage.local`; shows a red dot badge on the trigger button when an update is available
- Duplicate-guarded: checks for existing `#ed-tools-container` before injecting

**`styles.css`** uses CSS custom properties (`--ed-*`) on `:root` for theming, with a `@media (prefers-color-scheme: dark)` block that overrides them. Has `prefers-reduced-motion` support that kills all animations/transitions. Animations use `cubic-bezier` enter/exit keyframes. Class prefix is `ed-`.

## CI/CD

- **PR checks** (`.github/workflows/pr-check.yml`): validates `manifest.json` structure + semver version, checks all 5 icon files exist, runs `node --check` on both JS files, and enforces a CHANGELOG entry when `manifest.json` version changed
- **Release** (`.github/workflows/release.yml`): triggers on `v*` tag push, zips `manifest.json content.js prompts.js styles.css icons/`, creates GitHub Release with the zip attached
- **`scripts/bump-version.sh`**: validates semver, ensures clean working tree on `main`, updates `manifest.json` version via node, generates AI changelog from `git log` since last tag, prepends to `CHANGELOG.md`, commits, tags — but does NOT push

## Key constraints

- No build tools, no npm dependencies — keep it that way
- Clinical prompt content is safety-critical; do not rephrase or abbreviate medical standards
- `manifest.json` version is the single source of truth; any version bump must have a matching CHANGELOG entry
- Test by loading unpacked in Chrome/Edge and visiting the Copilot domains
