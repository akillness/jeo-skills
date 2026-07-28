#!/usr/bin/env bash
# E0 — distribution-channel propagation check (gate 0).
#
# The migration moves execution detail out of SKILL.md into references/. That is
# only safe if references/ actually reaches an installed catalog. install.sh does
# `cp -r "$clone_dir/.agent-skills" "$AGENT_SKILLS_DIR"` (install.sh:184), a whole
# tree copy, so this check proves propagation rather than assuming it.
#
#   E0-a    the 8 references-holding pilots keep every references/*.md
#   E0-a'   ooo (references-less pilot) keeps its non-references assets
#   E0-a''  harness keeps references/upstream/ (7 vendored files)
#   E0-b    a 4-file references sample survives byte-identical
#   E0-c    SKILL.md frontmatter is byte-identical after install
#
# Failure prints G0 and exits 1. The repo is never written to: everything runs
# against a disposable temp tree.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/.agent-skills"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/jeo-e0.XXXXXX")"
DEST="$WORK/.agent-skills"
trap 'rm -rf -- "$WORK"' EXIT

PASS=0
FAIL=0
pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

# Pilots that hold references/ (E0-a). `ooo` is deliberately absent: it has zero
# references, so including it would make E0-a fail structurally rather than
# detect a real propagation defect.
PILOTS_WITH_REFS=(
  api-documentation
  authentication-setup
  testing-strategies
  survey
  skill-standardization
  game-performance-profiler
  academic-research
  harness
)

echo "=== E0 distribution-channel check ==="
echo "source : $SRC"
echo "temp   : $DEST"
echo ""

# Reproduce the install.sh copy semantics exactly (install.sh:184).
if ! cp -r "$SRC" "$DEST"; then
  echo "G0: could not reproduce the install.sh copy" >&2
  exit 1
fi

echo "E0-a — references/*.md propagation for the 8 references-holding pilots"
for slug in "${PILOTS_WITH_REFS[@]}"; do
  src_n=$(find "$SRC/$slug/references" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  dst_n=$(find "$DEST/$slug/references" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$src_n" -gt 0 ] && [ "$src_n" = "$dst_n" ]; then
    pass "$slug: $dst_n/$src_n references"
  else
    fail "$slug: $dst_n/$src_n references"
  fi
done

echo ""
echo "E0-a' — ooo (references-less pilot) non-references asset propagation"
src_n=$(find "$SRC/ooo" -type f ! -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')
dst_n=$(find "$DEST/ooo" -type f ! -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')
if [ "$src_n" = "$dst_n" ] && [ "$src_n" -gt 0 ]; then
  pass "ooo: $dst_n/$src_n non-SKILL.md assets"
else
  fail "ooo: $dst_n/$src_n non-SKILL.md assets"
fi

echo ""
echo "E0-a'' — harness references/upstream/ vendored mirror"
src_n=$(find "$SRC/harness/references/upstream" -type f 2>/dev/null | wc -l | tr -d ' ')
dst_n=$(find "$DEST/harness/references/upstream" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$src_n" = "$dst_n" ] && [ "$src_n" -gt 0 ]; then
  pass "harness/references/upstream: $dst_n/$src_n files"
else
  fail "harness/references/upstream: $dst_n/$src_n files"
fi

echo ""
echo "E0-b — byte-identical references sample (4 files)"
sample=$(find "$SRC" -path '*/references/*.md' | sort | head -4)
n=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel="${f#"$SRC"/}"
  if cmp -s "$f" "$DEST/$rel"; then
    n=$((n + 1))
  else
    fail "byte mismatch: $rel"
  fi
done <<< "$sample"
[ "$n" = 4 ] && pass "4/4 reference files byte-identical" || fail "$n/4 reference files byte-identical"

echo ""
echo "E0-c — SKILL.md frontmatter byte-identical after install"
if python3 - "$SRC" "$DEST" <<'PY'
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(pathlib.Path.cwd() / "scripts"))
from frontmatter_boundary import frontmatter_sha256, iter_skill_docs, slug_of

src, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
bad = []
for doc in iter_skill_docs(src):
    mirror = dest / slug_of(doc) / "SKILL.md"
    if not mirror.is_file() or frontmatter_sha256(doc) != frontmatter_sha256(mirror):
        bad.append(slug_of(doc))
print(f"    frontmatter compared: {len(list(iter_skill_docs(src)))}, mismatched: {len(bad)}")
if bad:
    print("    " + ", ".join(bad[:10]))
raise SystemExit(1 if bad else 0)
PY
then
  pass "all frontmatter blocks byte-identical"
else
  fail "frontmatter differs after install"
fi

echo ""
echo "=== E0 result: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  echo "G0 — distribution-channel propagation is broken; do not enter A-lite." >&2
  exit 1
fi
echo "gate 0 clear"
