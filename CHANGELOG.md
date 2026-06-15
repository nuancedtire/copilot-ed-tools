# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-05-26

### Changed
- Complete rewrite of ED Clerking and Discharge Summary prompts to "pushy" documentation-assistant mode. Copilot now actively requests missing source material (observations, bloods, ECG, imaging, examination findings) before drafting, rather than passively accepting vague brain dumps. Clinician can override with "proceed anyway" — gaps are then explicitly documented.

### Added
- Prompt bubble collapsing: after sending, the full prompt bubble in Copilot's chat is cosmetically collapsed to a compact label (e.g. "🩺 ED Clerking prompt sent — View prompt ▾") with inline expand/collapse toggle. The prompt text sent to Copilot is unchanged.
- Robust button anchoring: layered fallback strategy finds the Copilot composer across UI variants (wrapper → contenteditable → chat container → floating fallback). Re-anchors automatically on DOM changes and route changes.
- Keyboard-first workflow: global shortcut (Alt+E or Ctrl+Shift+E) toggles the popover; arrow keys navigate commands; Enter runs; 1/2 run commands directly; Escape closes; Tab is trapped within the popover.
- Visual send feedback: trigger button shows "Sending…" with a spinner animation and is briefly disabled to prevent duplicate sends.
- Full accessibility pass: aria-label, aria-expanded, role="menu"/"menuitem", focus trap, focus return on close, visible focus-visible outlines on all interactive elements.
- Click-outside and route-change cleanup: popover closes on outside clicks; SPA navigation cleans up stale popover and re-anchors the button.
- prefers-reduced-motion support: all animations and transitions disabled when the user prefers reduced motion.
- Floating fallback mode: when the composer wrapper isn't found, the button becomes a compact circular floating action button in the bottom-right corner.

### Fixed
- Button no longer duplicates if the content script runs multiple times.
- MutationObservers are properly disconnected to avoid stacking leaks.

## [0.1.1] - 2025-05-23

### Fixed
- Vital signs and safety-critical items now explicitly prompted in interrogation phase rather than silently omitted as `[Not documented]`.

### Improved
- Interrogation phase persists through themed rounds and waits for user readiness before generating clerkings.

### Added
- Auto-update check: daily GitHub release comparison with subtle on-button notification when newer version is available.
- Dark mode support: automatic `prefers-color-scheme: dark` theming across popover and button.
- Refined iconography: update badge styling and consistent visual polish.

## [0.1.0] - 2025-05-22

### Added
- Initial public release on GitHub.
- Browser extension for Microsoft Copilot with ED Clerking and Discharge Summary prompts.
- Manifest V3 configuration with host permissions for `m365.cloud.microsoft` and `copilot.cloud.microsoft`.
- `content.js` for UI injection and interaction logic.
- `prompts.js` containing full clinical prompt templates for RCEM-compliant documentation.
- `styles.css` for clinical-inspired popover design.
- Extension icons (16px, 32px, 48px, 128px) and source SVG.
- MIT LICENSE file.
- GitHub Actions release workflow to automatically package and publish extension zip files.
- `CHANGELOG.md` and `AGENTS.md` project documentation.
