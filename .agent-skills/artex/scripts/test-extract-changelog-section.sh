#!/usr/bin/env bash
# Tests scripts/extract-changelog-section.sh against a fake CHANGELOG in a temp dir.
set -euo pipefail

extract="$(cd "$(dirname "$0")" && pwd)/extract-changelog-section.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/CHANGELOG.md" <<'EOF'
# Changelog

## [1.2.30] - 2030-01-03

Not this one.

## [1.2.3] - 2030-01-02

Summary line.

### Added

- **Thing**: did a thing (#1).

## [1.2.2] - 2030-01-01

- Older entry.
EOF

expected='Summary line.

### Added

- **Thing**: did a thing (#1).'

fail=0

if out=$(bash "$extract" 1.2.3 "$tmp/CHANGELOG.md") && [ "$out" = "$expected" ]; then
  echo "PASS: section [1.2.3] found, body returned exactly"
else
  echo "FAIL: section [1.2.3]; got:"; printf '%s\n' "${out-}"
  fail=1
fi

if out=$(bash "$extract" 9.9.9 "$tmp/CHANGELOG.md"); then
  echo "FAIL: missing section [9.9.9] exited 0; got:"; printf '%s\n' "$out"
  fail=1
elif [ -n "$out" ]; then
  echo "FAIL: missing section [9.9.9] printed output:"; printf '%s\n' "$out"
  fail=1
else
  echo "PASS: missing section [9.9.9] exits non-zero with no output"
fi

exit "$fail"
