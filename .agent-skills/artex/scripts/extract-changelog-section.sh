#!/usr/bin/env bash
# Print the body of the CHANGELOG section "## [<version>]": the lines after that
# heading up to (not including) the next "## [" heading, with leading and
# trailing blank lines removed. The version is matched literally (no leading v).
# Exit 1 with nothing on stdout when the section is missing or empty.
#
# Usage: scripts/extract-changelog-section.sh <version> [changelog]   (default CHANGELOG.md)
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ] || [ -z "$1" ]; then
  echo "usage: $0 <version> [changelog]" >&2
  exit 2
fi
version=$1
changelog=${2:-CHANGELOG.md}

body=$(awk -v head="## [$version]" '
  { sub(/\r$/, "") } # tolerate a CRLF checkout
  index($0, "## [") == 1 {
    if (found) exit
    rest = substr($0, length(head) + 1)
    if (substr($0, 1, length(head)) == head && (rest == "" || rest ~ /^[ \t]/)) { found = 1; next }
  }
  found { print }
' "$changelog")

# Trim leading blank lines ($(...) already drops the trailing ones).
body=$(printf '%s\n' "$body" | sed '/./,$!d')

if [ -z "$body" ]; then
  exit 1
fi
printf '%s\n' "$body"
