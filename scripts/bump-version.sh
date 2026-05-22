#!/usr/bin/env bash
set -euo pipefail

# bump-version.sh — Automated version bump, AI changelog generation, and release tag
# Usage: ./scripts/bump-version.sh X.Y.Z

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# ─── Validate input ──────────────────────────────────────────────────────────

NEW_VERSION="${1:-}"

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be semver (e.g., 0.2.0). Got: $NEW_VERSION"
  exit 1
fi

CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json')).version)")
echo "Current version: $CURRENT_VERSION"
echo "New version:     $NEW_VERSION"

# Simple semver comparison
sort -V -t. -k1,1 -k2,2 -k3,3 <(echo "$CURRENT_VERSION") <(echo "$NEW_VERSION") | head -1 | grep -q "^$CURRENT_VERSION$" || {
  echo "Error: New version must be greater than current version."
  exit 1
}

# ─── Ensure clean working tree on main ────────────────────────────────────────

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Error: You must be on the main branch to bump version."
  exit 1
fi

# ─── Update manifest.json ────────────────────────────────────────────────────

node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  manifest.version = '$NEW_VERSION';
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\\n');
  console.log('Updated manifest.json to', manifest.version);
"

# ─── Generate AI changelog prompt ─────────────────────────────────────────────

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -n "$LAST_TAG" ]; then
  DIFF_RANGE="${LAST_TAG}..HEAD"
else
  DIFF_RANGE="HEAD"
fi

# Get list of changed files
CHANGED_FILES=$(git diff --name-only "$DIFF_RANGE" 2>/dev/null | sort -u | sed 's/^/- /')

# Get commit messages (filtered out merge commits)
COMMITS=$(git log --format='- %s' "$DIFF_RANGE" 2>/dev/null | grep -v "^.*Merge pull request" | head -20)

TODAY=$(date +%Y-%m-%d)

PROMPT=$(cat <<EOF
Write a concise CHANGELOG entry for version $NEW_VERSION of a browser extension called "Copilot ED Tools" (an ED clinical documentation assistant for Microsoft Copilot).

Date: $TODAY

Files changed since last release:
$CHANGED_FILES

Commits since last release:
$COMMITS

Requirements:
- Categorize under: ### Added, ### Changed, ### Fixed, or ### Removed.
- Use concise bullet points (one line each).
- Focus on user-facing or extension-relevant changes.
- Skip purely internal/development-only changes unless notable.
- Do NOT include version number or date in the output — just the bullet points grouped by category.

Output format (no preamble, no conclusion):
### Added
- ...
### Changed
- ...
### Fixed
- ...
EOF
)

echo ""
echo "─────────────────────────────────────────────"
echo "Generated AI prompt for changelog entry"
echo "─────────────────────────────────────────────"

# ─── Call OpenCode AI ─────────────────────────────────────────────────────────

TMP_PROMPT_FILE=$(mktemp)
echo "$PROMPT" > "$TMP_PROMPT_FILE"

CHANGELOG_ENTRY=""

# Try to invoke OpenCode via available mechanisms
if command -v opencode >/dev/null 2>&1; then
  echo "Found opencode CLI. Generating changelog entry..."
  CHANGELOG_ENTRY=$(opencode --prompt "$(cat $TMP_PROMPT_FILE)" 2>/dev/null || true)
fi

# If that didn't work, try using the task/subagent mechanism if we're in an AI environment
if [ -z "$CHANGELOG_ENTRY" ]; then
  echo "Attempting AI generation via environment..."
  # Try a simple node-based approach or fallback to manual
  CHANGELOG_ENTRY=$(node -e "
    const fs = require('fs');
    const prompt = fs.readFileSync('$TMP_PROMPT_FILE', 'utf8');
    // In a true OpenCode environment, we might have access to internal APIs.
    // If not, we fallback to a basic placeholder and exit with error.
    console.error('AI changelog generation requires an active OpenCode session.');
    process.exit(1);
  " 2>/dev/null || true)
fi

rm -f "$TMP_PROMPT_FILE"

# ─── Fallback / Manual input ─────────────────────────────────────────────────

if [ -z "$CHANGELOG_ENTRY" ]; then
  echo ""
  echo "⚠️  Automatic AI generation failed or returned empty."
  echo "Please provide the CHANGELOG entry manually."
  echo ""
  echo "Paste the entry below (end with Ctrl+D):"
  CHANGELOG_ENTRY=$(cat)
fi

if [ -z "$CHANGELOG_ENTRY" ]; then
  echo "Error: No changelog entry provided. Aborting."
  exit 1
fi

# ─── Prepend to CHANGELOG.md ──────────────────────────────────────────────────

NEW_SECTION=$(cat <<EOF
## [$NEW_VERSION] - $TODAY

$CHANGELOG_ENTRY

EOF
)

# Insert after the "## [Unreleased]" line
awk -v section="$NEW_SECTION" '
  /^## \[Unreleased\]/ { print; print ""; print section; next }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

echo "Updated CHANGELOG.md"

# ─── Commit and tag ──────────────────────────────────────────────────────────

git add manifest.json CHANGELOG.md
git commit -m "chore(release): prepare v$NEW_VERSION

- Bump manifest.json version to $NEW_VERSION
- Update CHANGELOG.md"

git tag "v$NEW_VERSION"

echo ""
echo "✅ Version $NEW_VERSION prepared."
echo ""
echo "Next step: push to origin to trigger the release workflow"
echo "  git push origin main --tags"
echo ""
