#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: bash scripts/new-query-note.sh <vault_root> <title> [options]

Options:
  --section <queries|reports>  Target directory and index section (default: queries)
  --question <text>            Original question text
  --citation <wikilink>        Repeatable citation seed
  --force                      Overwrite an existing note
  -h, --help                   Show this help
EOF
}

if (($# < 2)); then
  usage
  exit 2
fi

VAULT_ROOT="$1"
TITLE="$2"
shift 2

SECTION="queries"
QUESTION=""
FORCE=0
CITATIONS=()

while (($# > 0)); do
  case "$1" in
    --section)
      SECTION="$2"
      shift 2
      ;;
    --question)
      QUESTION="$2"
      shift 2
      ;;
    --citation)
      CITATIONS+=("$2")
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
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

case "$SECTION" in
  queries|reports)
    ;;
  *)
    echo "Unsupported section: $SECTION" >&2
    exit 2
    ;;
esac

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#[^a-z0-9]+#-#g; s#^-+##; s#-+$##; s#-+#-#g'
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
SLUG="$(slugify "$TITLE")"
DIR="$VAULT_ROOT/wiki/$SECTION"
FILE_REL="wiki/$SECTION/${DATE}-${SLUG}.md"
FILE_PATH="$VAULT_ROOT/$FILE_REL"
MARKER="$(printf '%s' "$SECTION" | tr '[:lower:]' '[:upper:]')"

mkdir -p "$DIR"

if [[ -e "$FILE_PATH" && "$FORCE" -ne 1 ]]; then
  echo "query note already exists: $FILE_PATH" >&2
  echo "Use --force to overwrite." >&2
  exit 1
fi

{
  cat <<EOF
---
title: "$TITLE"
created_at: "$STAMP"
section: "$SECTION"
status: "draft"
---

# $TITLE

## Question

${QUESTION:-[Fill in the exact question that produced this note.]}

## Answer

- [ ] Replace with the durable answer

## Evidence and Citations

EOF
  if ((${#CITATIONS[@]})); then
    for citation in "${CITATIONS[@]}"; do
      printf -- '- %s\n' "$citation"
    done
  else
    printf -- '- [ ] Add wiki page citations and raw source references\n'
  fi
  cat <<'EOF'

## Follow-up Questions

- [ ] Add follow-up questions worth reusing later

## Filing Notes

- [ ] Link any concept, entity, or source pages that should be updated after this answer
EOF
} >"$FILE_PATH"

insert_marker_line "$VAULT_ROOT/index.md" "$MARKER" "- [[${FILE_REL%.md}]] - ${TITLE}"
append_log \
  "$VAULT_ROOT/log.md" \
  "## [$DATE] query | $TITLE" \
  "- Filed note: [[${FILE_REL%.md}]]
- Section: $SECTION"

echo "created $FILE_PATH"
