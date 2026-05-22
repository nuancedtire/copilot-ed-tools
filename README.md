# Copilot ED Tools

A lightweight browser extension that brings clinical documentation assistance directly into Microsoft Copilot. Built for ED clinicians who want RCEM-compliant, coroner-defensible clerkings and discharge summaries without leaving their workflow.

---

## What it does

Copilot ED Tools injects a discreet **ED Tools** button into Microsoft Copilot (m365.cloud.microsoft / copilot.cloud.microsoft). Click it to access two powerful documentation prompts:

| Tool | Purpose |
|------|---------|
| **ED Clerking** | Transform clinical brain dumps into structured, RCEM-compliant ED clerkings for Cerner |
| **Discharge Summary** | Draft concise, safe discharge summaries with built-in safety checks |

Both prompts are engineered by an experienced ED registrar to be:
- **Safety-first** — mandatory checks for red flags, gaps, and high-risk presentations
- **Efficient** — no filler, no didacticism; built for clinicians who know their craft
- **Defensible** — coroner-aware documentation standards throughout

---

## Installation (Recommended: From Release)

The easiest and most reliable way to install is from the latest GitHub release.

### Step-by-step

1. **Go to the Releases page**
   
   Visit [**https://github.com/nuancedtire/copilot-ed-tools/releases**](https://github.com/nuancedtire/copilot-ed-tools/releases)

2. **Download the latest zip**
   
   Find the most recent release (e.g., `v0.1.0`) and click `copilot-ed-tools-vX.Y.Z.zip` under **Assets** to download it.

3. **Unzip the file**
   
   Extract the zip to a folder on your computer (e.g., `~/Downloads/copilot-ed-tools-v0.1.0`).

4. **Load the extension in Chrome or Edge**
   
   - Open Chrome or Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
   - **Enable Developer Mode** using the toggle in the top right corner
   - Click **Load unpacked**
   - Select the unzipped folder you extracted in Step 3
   - The extension should now appear in your extensions list with the Copilot ED Tools icon

5. **Open Microsoft Copilot**
   
   Visit [https://copilot.cloud.microsoft](https://copilot.cloud.microsoft) or [https://m365.cloud.microsoft](https://m365.cloud.microsoft) and log in.
   
   The **ED Tools** button will appear near the chat input area.

---

## Installation (From Source — for Developers)

If you want to run the very latest code or contribute:

1. Clone the repository:
   ```bash
   git clone https://github.com/nuancedtire/copilot-ed-tools.git
   ```

2. Follow steps 4–5 above to load the extension unpacked from the cloned folder.

---

## Project Structure

```
copilot-ed-tools/
├── manifest.json          # Extension manifest (MV3)
├── prompts.js             # Clinical prompt definitions
├── content.js             # UI injection and interaction logic
├── styles.css             # Popover styling
├── icons/                 # Extension icons (16/32/48/128px PNG + SVG)
├── .github/workflows/     # CI/CD automation
│   ├── release.yml        # Creates GitHub Release on version tag push
│   └── pr-check.yml       # Validates every Pull Request
├── scripts/
│   └── bump-version.sh    # One-command version bump + AI changelog + tag
├── README.md              # This file
├── CHANGELOG.md           # Release history
├── AGENTS.md              # Agent/developer documentation
└── LICENSE                # MIT License
```

### Files explained

- **`manifest.json`** — Defines the extension: permissions, host matches, icons, and injected assets. **Source of truth for version.**
- **`prompts.js`** — Contains the full clinical prompt templates. This is the brain of the extension. Prompts cover:
  - Phase 1: Safety interrogation with presentation-specific questions
  - Phase 2: Structured clerking/discharge output
  - Phase 3: Addendum format for updates
  - Safety checks, edge cases, and writing rules
- **`content.js`** — Injects the ED Tools button, handles the popover UI, and pipes prompts into Copilot's input field
- **`styles.css`** — Soft, clinical-inspired popover design using warm terracotta tones
- **`icons/`** — Extension icons at all required MV3 sizes plus source SVG. Regenerate all PNGs from `icon.svg` if you update the logo.

---

## How it works

When you click a command in the ED Tools popover:

1. The corresponding prompt is retrieved from `prompts.js`
2. The prompt is inserted into Copilot's text input field
3. The send button is automatically triggered
4. Copilot receives a detailed, structured clinical prompt and generates documentation accordingly

You then simply paste your brain dump or clinical notes, and Copilot uses the embedded rules to produce a high-quality clerking or discharge summary.

---

## Prompts Overview

### ED Clerking
Designed to turn a raw clinical narrative into a full ED clerking with:
- Targeted safety interrogation (≤8 questions, grouped by theme)
- Structured output: PC, HPC, PMH, DH, SH, O/E, Ix, Impression, Plan
- Presentation-specific examination defaults (cardiac, abdominal, neuro, paeds, etc.)
- Built-in safety checks for high-risk presentations
- Addendum format for reassessment and new results

### Discharge Summary
Two-phase workflow:
1. **Safety Check** — flags concerns before discharge (vitals, pending investigations, capacity, social safety)
2. **Discharge Summary** — structured output with clinical narrative, plan, medications, and specific return triggers

Includes GP communication rules, paediatric additions, and edge cases (self-discharge, pending results, etc.).

---

## Customisation

The prompts in `prompts.js` are plain JavaScript strings. You can:
- Adjust clinical standards (e.g., switch from RCEM to local trust guidelines)
- Add new presentations or safety checks
- Modify output formatting for your EPR (Cerner, EPIC, etc.)
- Add additional commands by extending the `commands` array

---

## Contributing

Development happens on feature branches. Pull requests are required to merge into `main`.

### Branch protection rules

- `main` is protected: you must open a Pull Request to merge
- PRs must pass automated checks (`validate`, `lint-js`, `check-changelog`)
- As a solo maintainer, you can merge your own PRs (self-approvals allowed)

### For code changes (triggers a release)

1. Create a branch: `git checkout -b feature/my-change`
2. Make changes and test manually in Chrome/Edge
3. Push and open a Pull Request
4. After merge, run the helper script:
   ```bash
   ./scripts/bump-version.sh 0.2.0
   ```
   This auto-generates a changelog entry (via AI), commits, creates the tag, and pushes.
5. The existing GitHub Actions `release.yml` workflow sees the tag and creates the Release automatically

### For docs/maintenance (no release)

1. Create a branch: `git checkout -b fix/typo-in-readme`
2. Make changes (do **not** bump the version in `manifest.json`)
3. Push and open a Pull Request
4. Merge — no release is triggered

---

## Safety & Disclaimer

This extension is a **clinical documentation aid**, not a decision-support or diagnostic tool. It does not:
- Replace clinical judgment
- Generate diagnoses independently
- Substitute for senior review or standard care pathways

All output must be reviewed, edited, and validated by the responsible clinician before entry into the patient record. The prompts are designed to be defensible, but the clinician remains accountable for what is documented.

---

## Licence

MIT — feel free to fork, adapt, and share. If you improve the prompts or add new presentations, consider contributing back.

---

## Acknowledgements

Built with care for NHS Emergency Departments. Prompts reflect RCEM, NICE, and CHALICE guidance as of 2025.
