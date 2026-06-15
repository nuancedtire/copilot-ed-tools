(() => {
  "use strict";

  const PROMPTS = window.COPILOT_ED_TOOLS_PROMPTS;

  let isRunning = false;
  let updateAvailable = false;
  let composerObserver = null;
  let routeObserver = null;
  let currentPopover = null;
  let focusedIndex = -1;

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    injectFonts();
    mountOrRepositionButton();
    observeComposerChanges();
    observeRouteChanges();
    bindGlobalKeyboard();
    checkForUpdates();
  }

  /* ============================================================
     UPDATE CHECK (preserved)
     ============================================================ */

  async function checkForUpdates() {
    try {
      const now = Date.now();
      const stored = await chrome.storage.local.get(['lastUpdateCheck', 'latestVersion', 'updateAvailable']);

      if (stored.lastUpdateCheck && (now - stored.lastUpdateCheck) < 24 * 60 * 60 * 1000) {
        if (stored.updateAvailable) showUpdateBadge(stored.latestVersion);
        return;
      }

      const res = await fetch('https://api.github.com/repos/nuancedtire/copilot-ed-tools/releases/latest');
      if (!res.ok) return;
      const data = await res.json();
      const latest = data.tag_name ? data.tag_name.replace(/^v/, '') : '';
      const current = chrome.runtime.getManifest().version;

      const hasUpdate = latest && latest !== current && isNewerVersion(latest, current);

      await chrome.storage.local.set({
        lastUpdateCheck: now,
        latestVersion: latest,
        updateAvailable: hasUpdate,
      });

      if (hasUpdate) showUpdateBadge(latest);
    } catch (e) {
      // Silently fail — update check is non-critical
    }
  }

  function isNewerVersion(latest, current) {
    const parse = (v) => v.split('.').map(Number);
    const l = parse(latest);
    const c = parse(current);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
      const a = l[i] || 0;
      const b = c[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  function showUpdateBadge(version) {
    updateAvailable = version;
    const btn = document.getElementById('ed-tools-btn');
    if (btn) btn.classList.add('ed-tools-update');
  }

  function clearUpdateBadge() {
    updateAvailable = false;
    const btn = document.getElementById('ed-tools-btn');
    if (btn) btn.classList.remove('ed-tools-update');
  }

  /* ============================================================
     FONTS
     ============================================================ */

  function injectFonts() {
    if (document.getElementById("ed-tools-fonts")) return;
    const link = document.createElement("link");
    link.id = "ed-tools-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }

  /* ============================================================
     ANCHORING — robust, layered, resilient
     ============================================================ */

  function findComposer() {
    // Primary: the known Copilot chat input wrapper
    const wrapper = document.querySelector("#m365-chat-input-shared-wrapper");
    if (wrapper) return { type: "wrapper", el: wrapper };

    // Fallback 1: any visible contenteditable near the bottom
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    for (const ed of editables) {
      const r = ed.getBoundingClientRect();
      if (r.width > 200 && r.top > window.innerHeight * 0.6) {
        return { type: "editable", el: ed };
      }
    }

    // Fallback 2: main chat container
    const chat =
      document.querySelector('[data-testid*="chat"]') ||
      document.querySelector('[role="log"]') ||
      document.querySelector('main');
    if (chat) return { type: "chat", el: chat };

    return null;
  }

  function mountOrRepositionButton() {
    let container = document.getElementById("ed-tools-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "ed-tools-container";

      const btn = document.createElement("button");
      btn.id = "ed-tools-btn";
      btn.className = "ed-tools-trigger";
      btn.setAttribute("aria-label", "Open ED Tools");
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
        <span>ED Tools</span>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
      });

      container.appendChild(btn);
      document.body.appendChild(container);

      // Reposition on resize/scroll
      window.addEventListener("resize", debounce(mountOrRepositionButton, 150));
      const scrollTargets = [window, document.body, document.documentElement];
      scrollTargets.forEach((t) =>
        t.addEventListener("scroll", debounce(mountOrRepositionButton, 150), { passive: true })
      );
    }

    const composer = findComposer();
    if (composer && composer.type === "wrapper") {
      const rect = composer.el.getBoundingClientRect();
      container.style.bottom = `${window.innerHeight - rect.top + 12}px`;
      container.style.right = `${window.innerWidth - rect.right + 16}px`;
      container.style.left = "auto";
      container.style.top = "auto";
      container.classList.remove("ed-floating");
    } else {
      // Floating fallback
      container.style.bottom = "20px";
      container.style.right = "20px";
      container.style.left = "auto";
      container.style.top = "auto";
      container.classList.add("ed-floating");
    }
  }

  function observeComposerChanges() {
    if (composerObserver) composerObserver.disconnect();
    composerObserver = new MutationObserver(debounce(() => {
      mountOrRepositionButton();
    }, 200));
    composerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function observeRouteChanges() {
    if (routeObserver) routeObserver.disconnect();
    // Watch URL changes and full body mutations to catch SPA navigation
    let lastUrl = location.href;
    routeObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        closeMenu();
        mountOrRepositionButton();
      }
    });
    routeObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
     MENU / POPOVER
     ============================================================ */

  function toggleMenu() {
    if (currentPopover) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function openMenu() {
    const container = document.getElementById("ed-tools-container");
    if (!container || currentPopover) return;

    const btn = document.getElementById("ed-tools-btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("ed-active");
    }

    const popover = document.createElement("div");
    popover.id = "ed-tools-modal";
    popover.setAttribute("role", "menu");
    popover.setAttribute("aria-label", "ED Tools commands");

    const updateNotice = updateAvailable
      ? `<div class="ed-update-notice">Update available: <strong>v${updateAvailable}</strong> — <a href="https://github.com/nuancedtire/copilot-ed-tools/releases/latest" target="_blank" rel="noopener">GitHub releases ↗</a></div>`
      : '';

    const commandButtons = PROMPTS.commands.map((cmd, idx) => `
      <button
        class="ed-command-btn"
        data-id="${cmd.id}"
        data-index="${idx}"
        role="menuitem"
        tabindex="-1"
      >
        <div class="ed-command-icon">
          ${cmd.id === 'clerking'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                <path d="M9 14h6"/><path d="M9 10h6"/><path d="M9 18h4"/>
               </svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M9 15l2 2 4-4"/>
               </svg>`
          }
        </div>
        <div class="ed-command-content">
          <span class="ed-command-label">${escapeHtml(cmd.label)}</span>
          <span class="ed-command-desc">${cmd.id === 'clerking'
            ? 'Transform brain dumps into defensible, RCEM-compliant clerkings'
            : 'Draft concise, safe discharge summaries for Cerner'
          }</span>
        </div>
      </button>
    `).join('');

    popover.innerHTML = `
      <div class="ed-modal">
        <button id="ed-tools-close" class="ed-modal-close" aria-label="Close ED Tools" role="menuitem" tabindex="-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="ed-modal-header">
          <div>
            <h3 class="ed-modal-title">ED Tools</h3>
            <p class="ed-modal-subtitle">Clinical documentation assistance <span class="ed-version">v${chrome.runtime.getManifest().version}</span></p>
          </div>
        </div>

        ${updateNotice}

        <div class="ed-commands" role="group" aria-label="Commands">
          ${commandButtons}
        </div>
      </div>
    `;

    container.appendChild(popover);
    currentPopover = popover;

    // Focus trap and keyboard navigation
    focusedIndex = 0;
    focusCommand(0);
    document.addEventListener("keydown", onPopoverKeydown);
    document.addEventListener("click", onDocClick);

    // Click handling within popover
    popover.addEventListener("click", (e) => {
      if (e.target.closest("#ed-tools-close")) {
        closeMenu();
        return;
      }
      const cmdBtn = e.target.closest("button[data-id]");
      if (cmdBtn) {
        e.stopPropagation();
        const cmd = PROMPTS.commands.find((c) => c.id === cmdBtn.dataset.id);
        if (cmd) {
          closeMenu();
          runCommand(cmd);
        }
      }
    });
  }

  function closeMenu() {
    if (!currentPopover) return;
    const btn = document.getElementById("ed-tools-btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("ed-active");
      btn.focus();
    }

    currentPopover.classList.add("ed-modal-exit");
    setTimeout(() => {
      if (currentPopover && currentPopover.parentNode) {
        currentPopover.remove();
      }
      currentPopover = null;
    }, 250);

    document.removeEventListener("keydown", onPopoverKeydown);
    document.removeEventListener("click", onDocClick);
    focusedIndex = -1;
  }

  /* ============================================================
     POPOVER KEYBOARD NAVIGATION
     ============================================================ */

  function onPopoverKeydown(e) {
    const cmdCount = PROMPTS.commands.length;

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % (cmdCount + 1); // +1 for close button at end
      focusCommand(focusedIndex);
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + (cmdCount + 1)) % (cmdCount + 1);
      focusCommand(focusedIndex);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const focusedEl = document.activeElement;
      if (focusedEl && focusedEl.id === "ed-tools-close") {
        closeMenu();
        return;
      }
      const cmdBtn = focusedEl?.closest("button[data-id]");
      if (cmdBtn) {
        const cmd = PROMPTS.commands.find((c) => c.id === cmdBtn.dataset.id);
        if (cmd) {
          closeMenu();
          runCommand(cmd);
        }
      }
      return;
    }

    // Number shortcuts: 1 = first command, 2 = second
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === "1") {
        e.preventDefault();
        closeMenu();
        if (PROMPTS.commands[0]) runCommand(PROMPTS.commands[0]);
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        closeMenu();
        if (PROMPTS.commands[1]) runCommand(PROMPTS.commands[1]);
        return;
      }
    }

    // Tab trap
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        focusedIndex = (focusedIndex - 1 + (cmdCount + 1)) % (cmdCount + 1);
      } else {
        focusedIndex = (focusedIndex + 1) % (cmdCount + 1);
      }
      focusCommand(focusedIndex);
    }
  }

  function focusCommand(index) {
    if (!currentPopover) return;
    const closeBtn = currentPopover.querySelector("#ed-tools-close");
    const cmdBtns = Array.from(currentPopover.querySelectorAll("button[data-id]"));
    const allFocusables = [...cmdBtns, closeBtn];
    const target = allFocusables[index];
    if (target) {
      target.focus();
      focusedIndex = index;
    }
  }

  function onDocClick(e) {
    const container = document.getElementById("ed-tools-container");
    if (container && !container.contains(e.target)) {
      closeMenu();
    }
  }

  /* ============================================================
     GLOBAL KEYBOARD SHORTCUT
     ============================================================ */

  function bindGlobalKeyboard() {
    document.addEventListener("keydown", (e) => {
      // Alt+E or Ctrl+Shift+E
      const isToggle =
        (e.altKey && e.key.toLowerCase() === "e") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e");

      if (isToggle) {
        e.preventDefault();
        toggleMenu();
      }
    });
  }

  /* ============================================================
     COMMAND EXECUTION — send + observe bubble
     ============================================================ */

  function runCommand(command) {
    if (isRunning) return;
    isRunning = true;

    const text = PROMPTS.build(command);

    const input =
      document.querySelector(
        '#m365-chat-input-shared-wrapper [contenteditable="true"]'
      ) || document.querySelector('[contenteditable="true"]');

    if (!input) {
      console.warn("Copilot input not found");
      isRunning = false;
      return;
    }

    // Visual feedback on button
    const btn = document.getElementById("ed-tools-btn");
    if (btn) {
      btn.classList.add("ed-sending");
      btn.setAttribute("aria-label", "Sending prompt…");
      const span = btn.querySelector("span");
      if (span) {
        span.dataset.original = span.textContent;
        span.textContent = "Sending…";
      }
    }

    input.focus();
    document.execCommand("insertText", false, text);

    setTimeout(() => {
      const sendBtn = findSendButton();
      if (sendBtn) sendBtn.click();

      // Observe for bubble collapsing
      observeForPromptBubble({
        promptText: text,
        label: command.collapsedLabel || command.label,
      });

      setTimeout(() => {
        isRunning = false;
        if (btn) {
          btn.classList.remove("ed-sending");
          btn.setAttribute("aria-label", "Open ED Tools");
          const span = btn.querySelector("span");
          if (span && span.dataset.original) {
            span.textContent = span.dataset.original;
          }
        }
      }, 1200);
    }, 400);
  }

  function findSendButton() {
    const wrapper = document.querySelector("#m365-chat-input-shared-wrapper");
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const el = document.elementFromPoint(rect.right - 20, rect.bottom - 20);
      return el?.closest("button");
    }
    // Fallback: any button near the bottom contenteditable
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    for (const ed of editables) {
      const r = ed.getBoundingClientRect();
      if (r.width > 200 && r.top > window.innerHeight * 0.6) {
        const el = document.elementFromPoint(r.right - 16, r.bottom - 16);
        const btn = el?.closest("button");
        if (btn) return btn;
      }
    }
    return null;
  }

  /* ============================================================
     PROMPT BUBBLE COLLAPSING — cosmetic only
     ============================================================ */

  function observeForPromptBubble({ promptText, label }) {
    const target = normaliseText(promptText);
    const firstSentence = target.split(/[.!?]/)[0];
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(() => {
      const bubble = findMatchingUserPromptBubble(target, firstSentence);
      if (bubble) {
        collapsePromptBubble(bubble, promptText, label);
        clearInterval(interval);
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 500);
  }

  function findMatchingUserPromptBubble(target, firstSentence) {
    // Strategy 1: common chat message selectors
    const selectors = [
      '[role="listitem"]',
      '[role="article"]',
      '[role="log"] > div > div',
      '[data-testid*="chat"] > div > div',
    ];

    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        for (const node of nodes) {
          const txt = normaliseText(node.textContent);
          if (matchPromptText(txt, target, firstSentence)) return node;
        }
      } catch (_) { /* invalid selector — skip */ }
    }

    // Strategy 2: broader scan for any element containing enough prompt text
    const candidates = document.querySelectorAll('div, p, article, li, section');
    for (const el of candidates) {
      const txt = normaliseText(el.textContent);
      if (txt.length < 200) continue;
      if (matchPromptText(txt, target, firstSentence)) {
        const parent = el.closest('[role="log"], [role="list"], [data-testid*="chat"], main, [aria-live]');
        if (parent) return el;
      }
    }

    return null;
  }

  function matchPromptText(text, target, firstSentence) {
    if (!text || !target) return false;
    if (text === target) return true;
    if (text.length >= 200 && target.length >= 200 && text.slice(0, 200) === target.slice(0, 200)) return true;
    if (text.includes(target.slice(0, 200))) return true;
    if (firstSentence && text.includes(firstSentence)) return true;
    return false;
  }

  function normaliseText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isLikelyInjectedPrompt(bubbleText, promptText) {
    const bubble = normaliseText(bubbleText);
    const prompt = normaliseText(promptText);

    if (!bubble || !prompt) return false;
    if (bubble === prompt) return true;
    if (bubble.startsWith(prompt.slice(0, 250))) return true;
    if (bubble.includes(prompt.slice(0, 250))) return true;

    const firstSentence = prompt.split(/[.!?]/)[0];
    if (firstSentence && bubble.includes(firstSentence)) return true;

    return false;
  }

  function collapsePromptBubble(bubble, originalPrompt, label) {
    // Store original in data attribute, then replace visible content
    bubble.setAttribute("data-ed-original-prompt", originalPrompt);
    bubble.setAttribute("data-ed-collapsed", "true");

    // Clear current content and build collapsed UI
    const inner = bubble.querySelector("div[class], p, span[class]") || bubble;
    inner.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "ed-prompt-collapsed";

    const labelSpan = document.createElement("span");
    labelSpan.className = "ed-prompt-label";
    labelSpan.textContent = label;

    const toggle = document.createElement("button");
    toggle.className = "ed-prompt-toggle";
    toggle.setAttribute("aria-label", "View prompt");
    toggle.textContent = "View prompt \u25BE";

    toggle.addEventListener("click", () => {
      const isExpanded = bubble.getAttribute("data-ed-expanded") === "true";
      if (isExpanded) {
        // Collapse
        inner.innerHTML = "";
        inner.appendChild(wrapper);
        bubble.setAttribute("data-ed-expanded", "false");
        toggle.textContent = "View prompt \u25BE";
        toggle.setAttribute("aria-label", "View prompt");
      } else {
        // Expand
        const expanded = document.createElement("div");
        expanded.className = "ed-prompt-expanded";
        expanded.textContent = originalPrompt;
        inner.innerHTML = "";
        inner.appendChild(wrapper);
        inner.appendChild(expanded);
        bubble.setAttribute("data-ed-expanded", "true");
        toggle.textContent = "Hide prompt \u25B4";
        toggle.setAttribute("aria-label", "Hide prompt");
      }
    });

    wrapper.appendChild(labelSpan);
    wrapper.appendChild(toggle);
    inner.appendChild(wrapper);
  }

  /* ============================================================
     UTILITIES
     ============================================================ */

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ============================================================
     TEST EXPOSURE
     ============================================================ */

  if (window.__ED_TOOLS_TEST__) {
    window.__edTools = {
      debounce,
      escapeHtml,
      normaliseText,
      isNewerVersion,
      isLikelyInjectedPrompt,
      findComposer,
      findSendButton,
      _isRunning() { return isRunning; },
      _reset() {
        isRunning = false;
        updateAvailable = false;
        if (composerObserver) { composerObserver.disconnect(); composerObserver = null; }
        if (routeObserver) { routeObserver.disconnect(); routeObserver = null; }
        if (currentPopover) {
          currentPopover.remove();
          currentPopover = null;
        }
        const container = document.getElementById('ed-tools-container');
        if (container) container.remove();
      },
    };
  }

  /* ============================================================
     BOOT
     ============================================================ */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
