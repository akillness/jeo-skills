#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: bash scripts/ingest-url.sh <vault_root> <url> [options] [-- extra scrapling args]

Options:
  --mode <get|fetch|stealth>   Scrapling mode (default: get)
  --slug <slug>                File slug override
  --title <title>              Human-readable title for the source page
  --force                      Overwrite existing raw/source files
  -h, --help                   Show this help

Requires the `scrapling` CLI. The raw capture is saved to raw/sources/ and
the source stub is created under wiki/sources/.
EOF
}

if (($# < 2)); then
  usage
  exit 2
fi

VAULT_ROOT="$1"
URL="$2"
shift 2

MODE="get"
SLUG=""
TITLE=""
FORCE=0
EXTRA_ARGS=()

while (($# > 0)); do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --slug)
      SLUG="$2"
      shift 2
      ;;
    --title)
      TITLE="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA_ARGS=("$@")
      break
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

SCRAPLING_BIN="${SCRAPLING_BIN:-scrapling}"
if ! command -v "$SCRAPLING_BIN" >/dev/null 2>&1; then
  echo "scrapling CLI not found: $SCRAPLING_BIN" >&2
  echo "Install it with the scrapling skill or set SCRAPLING_BIN to a valid binary." >&2
  exit 1
fi

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#https?://##g; s#[^a-z0-9]+#-#g; s#^-+##; s#-+$##; s#-+#-#g'
}

titleize() {
  printf '%s' "$1" | sed -E 's/-/ /g'
}

insert_marker_line() {
  local file="$1"
  local marker="$2"
  local line="$3"
  python3 - "$file" "$marker" "$line" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
marker = sys.argv[2]
line = sys.argv[3]
text = path.read_text(encoding="utf-8")
anchor = f"<!-- {marker}:END -->"
if line in text:
    raise SystemExit(0)
if anchor not in text:
    text = text.rstrip() + "\n\n" + line + "\n"
else:
    text = text.replace(anchor, line + "\n" + anchor)
path.write_text(text, encoding="utf-8")
PY
}

append_log() {
  local file="$1"
  local heading="$2"
  local body="$3"
  if grep -Fq "$heading" "$file"; then
    return 0
  fi
  {
    printf '\n%s\n' "$heading"
    printf '%s\n' "$body"
  } >>"$file"
}

DATE="$(date +%F)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VAULT_ROOT="${VAULT_ROOT%/}"
SLUG="${SLUG:-$(slugify "$URL")}"
TITLE="${TITLE:-$(titleize "$SLUG")}"

mkdir -p "$VAULT_ROOT/raw/sources" "$VAULT_ROOT/wiki/sources"

RAW_REL="raw/sources/${DATE}-${SLUG}.md"
RAW_PATH="$VAULT_ROOT/$RAW_REL"
SOURCE_REL="wiki/sources/${DATE}-${SLUG}.md"
SOURCE_PATH="$VAULT_ROOT/$SOURCE_REL"

if [[ -e "$RAW_PATH" && "$FORCE" -ne 1 ]]; then
  echo "raw source already exists: $RAW_PATH" >&2
  echo "Use --force to overwrite." >&2
  exit 1
fi

if [[ -e "$SOURCE_PATH" && "$FORCE" -ne 1 ]]; then
  echo "source page already exists: $SOURCE_PATH" >&2
  echo "Use --force to overwrite." >&2
  exit 1
fi

case "$MODE" in
  get)
    CMD=(extract get)
    ;;
  fetch|dynamic)
    CMD=(extract fetch)
    ;;
  stealth|protected|stealthy-fetch)
    CMD=(extract stealthy-fetch)
    ;;
  *)
    echo "Unsupported mode: $MODE" >&2
    exit 2
    ;;
esac

SCRAPLING_CALL=("$SCRAPLING_BIN" "${CMD[@]}" "$URL" "$RAW_PATH")
if ((${#EXTRA_ARGS[@]})); then
  SCRAPLING_CALL+=("${EXTRA_ARGS[@]}")
fi
"${SCRAPLING_CALL[@]}"

cat >"$SOURCE_PATH" <<EOF
---
title: "$TITLE"
source_type: "web"
source_url: "$URL"
raw_path: "$RAW_REL"
ingested_at: "$STAMP"
status: "pending-synthesis"
---

# $TITLE

## Summary

- [ ] Replace with an LLM-written summary grounded in \`$RAW_REL\`

## Key Claims

- [ ] Add grounded claims with citations

## Related Pages

- [ ] Link relevant entity and concept pages

## Contradictions or Uncertainty

- [ ] Note anything that conflicts with existing wiki pages

## Open Questions

- [ ] Add follow-up questions worth investigating
EOF

insert_marker_line "$VAULT_ROOT/index.md" "SOURCES" "- [[${SOURCE_REL%.md}]] - Pending synthesis for ${TITLE}"
append_log \
  "$VAULT_ROOT/log.md" \
  "## [$DATE] ingest | $TITLE" \
  "- URL: $URL
- Raw source: [[${RAW_REL%.md}]]
- Source page: [[${SOURCE_REL%.md}]]
- Mode: $MODE"

echo "captured $RAW_PATH"
echo "created  $SOURCE_PATH"
