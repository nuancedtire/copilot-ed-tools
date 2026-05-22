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

## Installation

### Chrome / Edge (Manifest V3)

1. **Download or clone** this repository:
   ```bash
   git clone https://github.com/nuancedtire/copilot-ed-tools.git
   ```

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in the top right)

4. Click **Load unpacked** and select the `copilot-ed-tools` folder

5. Open [Microsoft Copilot](https://copilot.cloud.microsoft) or [M365 Chat](https://m365.cloud.microsoft) — the ED Tools button will appear near the input area

---

## Releases

The easiest way to install is to download the latest release:

1. Go to the [**Releases** page](https://github.com/nuancedtire/copilot-ed-tools/releases)
2. Download the latest `copilot-ed-tools-vX.Y.Z.zip`
3. Unzip the file
4. Follow steps 2–5 above to load it in Chrome/Edge

---

## Project Structure

```
copilot-ed-tools/
├── manifest.json      # Extension manifest (MV3)
├── prompts.js         # Clinical prompt definitions
├── content.js         # UI injection and interaction logic
├── styles.css         # Popover styling
└── README.md          # This file
```

### Files explained

- **`manifest.json`** — Defines the extension: permissions, host matches, and injected assets
- **`prompts.js`** — Contains the full clinical prompt templates. This is the brain of the extension. Prompts cover:
  - Phase 1: Safety interrogation with presentation-specific questions
  - Phase 2: Structured clerking/discharge output
  - Phase 3: Addendum format for updates
  - Safety checks, edge cases, and writing rules
- **`content.js`** — Injects the ED Tools button, handles the popover UI, and pipes prompts into Copilot's input field
- **`styles.css`** — Soft, clinical-inspired popover design using warm terracotta tones

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
