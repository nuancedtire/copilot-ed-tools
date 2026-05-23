(() => {
  "use strict";

  const PROMPTS = window.COPILOT_ED_TOOLS_PROMPTS;

  let isRunning = false;
  let updateAvailable = false;

  function init() {
    injectFonts();
    injectButton();
    checkForUpdates();
  }

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

  function injectFonts() {
    if (document.getElementById("ed-tools-fonts")) return;
    const link = document.createElement("link");
    link.id = "ed-tools-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }

  function injectButton() {
    if (document.getElementById("ed-tools-container")) return;

    const container = document.createElement("div");
    container.id = "ed-tools-container";

    const btn = document.createElement("button");
    btn.id = "ed-tools-btn";
    btn.className = "ed-tools-trigger";

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      </svg>
      <span>ED Tools</span>
    `;

    btn.onclick = openMenu;
    container.appendChild(btn);
    document.body.appendChild(container);

    positionContainer();
    window.addEventListener("resize", positionContainer);

    const scrollTargets = [window, document.body, document.documentElement];
    scrollTargets.forEach((t) =>
      t.addEventListener("scroll", positionContainer, { passive: true })
    );
  }

  function positionContainer() {
    const container = document.getElementById("ed-tools-container");
    if (!container) return;

    const wrapper = document.querySelector("#m365-chat-input-shared-wrapper");

    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      container.style.bottom = `${window.innerHeight - rect.top + 12}px`;
      container.style.right = `${window.innerWidth - rect.right + 16}px`;
      container.style.left = "auto";
      container.style.top = "auto";
    } else {
      container.style.bottom = "20px";
      container.style.right = "20px";
      container.style.left = "auto";
      container.style.top = "auto";
    }
  }

  function openMenu() {
    const container = document.getElementById("ed-tools-container");
    if (!container || document.getElementById("ed-tools-modal")) return;

    const popover = document.createElement("div");
    popover.id = "ed-tools-modal";

    const updateNotice = updateAvailable
      ? `<div class="ed-update-notice">Update available: <strong>v${updateAvailable}</strong> — <a href="https://github.com/nuancedtire/copilot-ed-tools/releases/latest" target="_blank" rel="noopener">GitHub releases ↗</a></div>`
      : '';

    popover.innerHTML = `
      <div class="ed-modal">
        <button id="ed-tools-close" class="ed-modal-close" aria-label="Close">
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

        <div class="ed-commands">
          <button class="ed-command-btn" data-id="clerking">
            <div class="ed-command-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                <path d="M9 14h6"/>
                <path d="M9 10h6"/>
                <path d="M9 18h4"/>
              </svg>
            </div>
            <div class="ed-command-content">
              <span class="ed-command-label">ED Clerking</span>
              <span class="ed-command-desc">Transform brain dumps into defensible, RCEM-compliant clerkings</span>
            </div>
          </button>

          <button class="ed-command-btn" data-id="discharge">
            <div class="ed-command-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M9 15l2 2 4-4"/>
              </svg>
            </div>
            <div class="ed-command-content">
              <span class="ed-command-label">Discharge Summary</span>
              <span class="ed-command-desc">Draft concise, safe discharge summaries for Cerner</span>
            </div>
          </button>
        </div>
      </div>
    `;

    container.appendChild(popover);

    const closeModal = () => {
      popover.classList.add("ed-modal-exit");
      setTimeout(() => {
        if (popover.parentNode) popover.remove();
      }, 300);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("click", onDocClick);
    };

    popover.addEventListener("click", (e) => {
      if (e.target.closest("#ed-tools-close")) {
        closeModal();
        return;
      }

      const cmdBtn = e.target.closest("button[data-id]");
      if (cmdBtn) {
        const cmd = PROMPTS.commands.find((c) => c.id === cmdBtn.dataset.id);
        closeModal();
        runCommand(cmd);
      }
    });

    const onKeydown = (e) => {
      if (e.key === "Escape") closeModal();
    };

    const onDocClick = (e) => {
      const containerEl = document.getElementById("ed-tools-container");
      if (containerEl && !containerEl.contains(e.target)) {
        closeModal();
      }
    };

    document.addEventListener("keydown", onKeydown);
    // Delay attaching so the opening click doesn't immediately close it
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  }

  function runCommand(command) {
    if (isRunning) return;
    isRunning = true;

    const text = PROMPTS.build(command);

    const input =
      document.querySelector(
        '#m365-chat-input-shared-wrapper [contenteditable="true"]'
      ) || document.querySelector('[contenteditable="true"]');

    if (!input) {
      console.warn("Input not found");
      isRunning = false;
      return;
    }

    input.focus();
    document.execCommand("insertText", false, text);

    setTimeout(() => {
      const btn = findSendButton();
      if (btn) btn.click();

      setTimeout(() => {
        isRunning = false;
      }, 1000);
    }, 400);
  }

  function findSendButton() {
    const wrapper = document.querySelector("#m365-chat-input-shared-wrapper");
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    const el = document.elementFromPoint(rect.right - 20, rect.bottom - 20);
    return el?.closest("button");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
