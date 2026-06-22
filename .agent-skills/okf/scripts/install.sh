#!/usr/bin/env bash
# okf skill installer
#
# Verifies the pyyaml dependency (used by the bundle validator and consume
# examples) and optionally validates an existing OKF bundle.
# Idempotent and safe to re-run.
#
# Env knobs:
#   SKIP_PYYAML=1     - skip pyyaml install check
#   BUNDLE_PATH=<dir> - validate the given bundle after install (default: skip)
#   GLOBAL=1          - install the skill globally (npx skills add -g)
#
# Usage:
#   bash scripts/install.sh
#   BUNDLE_PATH=./knowledge GLOBAL=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[okf]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[okf]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"

install_pyyaml() {
  if python3 -c "import yaml" 2>/dev/null; then
    log "pyyaml already available."
    return 0
  fi

  log "Installing pyyaml (required for OKF bundle validation and consume examples)…"

  # Prefer uv if available (PEP 668-safe)
  if command -v uv >/dev/null 2>&1; then
    uv pip install pyyaml || warn "uv pip install failed — trying pip fallback."
    return 0
  fi

  # pip with --break-system-packages fallback for managed environments
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install pyyaml 2>/dev/null \
      || pip3 install --break-system-packages pyyaml 2>/dev/null \
      || warn "pip3 install failed — install pyyaml manually: pip install pyyaml"
    return 0
  fi

  warn "Python package manager not found. Install pyyaml manually: pip install pyyaml"
}

validate_bundle() {
  local bundle="$1"
  if [ ! -d "$bundle" ]; then
    warn "BUNDLE_PATH='$bundle' is not a directory — skipping validation."
    return 0
  fi

  log "Validating OKF bundle at '$bundle'…"
  python3 - "$bundle" <<'PYEOF'
import os, sys, re

bundle = sys.argv[1]
errors = []

for root, dirs, files in os.walk(bundle):
    for f in files:
        if not f.endswith('.md'):
            continue
        path = os.path.join(root, f)
        text = open(path).read()
        if not text.startswith('---'):
            continue  # not an OKF file
        fm_end = text.find('---', 3)
        if fm_end == -1:
            errors.append(f'{path}: unclosed YAML frontmatter')
            continue
        fm = text[3:fm_end]
        for field in ('type:', 'title:', 'description:'):
            if field not in fm:
                errors.append(f'{path}: missing required field {field!r}')

if errors:
    for e in errors:
        print('ERROR:', e)
    sys.exit(1)
else:
    count = sum(
        1 for root, _, files in os.walk(bundle)
        for f in files if f.endswith('.md') and open(os.path.join(root, f)).read().startswith('---')
    )
    print(f'OK — {count} OKF file(s) valid')
PYEOF
}

install_skill() {
  if command -v npx >/dev/null 2>&1; then
    if [ "${GLOBAL:-0}" = "1" ]; then
      log "Installing okf skill globally via npx skills…"
      npx skills add "$REPO_URL" --skill okf -g \
        || warn "npx skills add failed — install manually (git clone)."
    else
      log "Installing okf skill via npx skills…"
      npx skills add "$REPO_URL" --skill okf \
        || warn "npx skills add failed — install manually (git clone)."
    fi
  else
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/skills/okf ~/.agents/skills/okf"
  fi
}

log "Starting OKF skill setup"
[ "${SKIP_PYYAML:-0}" = "1" ] || install_pyyaml

if [ -n "${BUNDLE_PATH:-}" ]; then
  validate_bundle "$BUNDLE_PATH"
fi

install_skill
log "Done. See skills/okf/SKILL.md for the full OKF authoring guide."
