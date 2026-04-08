#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: bash scripts/bootstrap-vault.sh <vault_root> [--force]

Create a minimal llm-wiki vault structure with:
  raw/sources/
  raw/assets/
  wiki/sources/
  wiki/entities/
  wiki/concepts/
  wiki/queries/
  wiki/reports/
  index.md
  log.md
  AGENTS.md
EOF
}

if (($# < 1)); then
  usage
  exit 2
fi

FORCE=0
VAULT_ROOT=""

while (($# > 0)); do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$VAULT_ROOT" ]]; then
        VAULT_ROOT="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$VAULT_ROOT" ]]; then
  usage
  exit 2
fi

VAULT_ROOT="${VAULT_ROOT%/}"

write_file() {
  local path="$1"
  local rel="${path#$VAULT_ROOT/}"
  if [[ -e "$path" && "$FORCE" -ne 1 ]]; then
    echo "skip  $rel"
    return 0
  fi
  mkdir -p "$(dirname "$path")"
  cat >"$path"
  echo "write $rel"
}

mkdir -p \
  "$VAULT_ROOT/raw/sources" \
  "$VAULT_ROOT/raw/assets" \
  "$VAULT_ROOT/wiki/sources" \
  "$VAULT_ROOT/wiki/entities" \
  "$VAULT_ROOT/wiki/concepts" \
  "$VAULT_ROOT/wiki/queries" \
  "$VAULT_ROOT/wiki/reports"

write_file "$VAULT_ROOT/AGENTS.md" <<'EOF'
# Wiki Schema

This vault is a persistent LLM-maintained wiki.

## Invariants

1. Treat `raw/` as immutable source of truth.
2. Treat `wiki/`, `index.md`, and `log.md` as LLM-maintained working artifacts.
3. On ingest, update the raw source capture, a source summary page, affected synthesis pages, `index.md`, and `log.md`.
4. On query, read `index.md` first, then relevant wiki pages, then raw sources only if grounding is needed.
5. File durable answers back into `wiki/queries/` or `wiki/reports/`.
6. During lint passes, look for broken links, orphan pages, stale claims, contradictions, and missing page candidates.

## Style

- Prefer markdown with wiki links to real pages in the vault.
- Use kebab-case file names and a single H1 matching the page title.
- Distinguish grounded source notes from higher-level synthesis.
- Preserve citations to page paths, raw source paths, or source URLs.
- Keep the schema short and revise it when repeated drift appears.
EOF

write_file "$VAULT_ROOT/index.md" <<'EOF'
# Index

This is the content-oriented map of the wiki. Read this file first before broad search.

## Overview

- Replace this section with a short synthesis once the wiki has a few real pages.

## Sources
<!-- SOURCES:START -->
<!-- SOURCES:END -->

## Entities
<!-- ENTITIES:START -->
<!-- ENTITIES:END -->

## Concepts
<!-- CONCEPTS:START -->
<!-- CONCEPTS:END -->

## Queries
<!-- QUERIES:START -->
<!-- QUERIES:END -->

## Reports
<!-- REPORTS:START -->
<!-- REPORTS:END -->
EOF

write_file "$VAULT_ROOT/log.md" <<'EOF'
# Log

Append-only timeline of meaningful wiki operations.

Use headings in this format:

```md
## [YYYY-MM-DD] ingest | Source title
## [YYYY-MM-DD] query  | Question title
## [YYYY-MM-DD] lint   | Pass summary
```

Each entry should list the files touched, the reason for the change, and any follow-up work.
EOF

echo "ready $VAULT_ROOT"
