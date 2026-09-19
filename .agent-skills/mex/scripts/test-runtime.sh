#!/usr/bin/env bash
# Regression tests for mex runtime resolution and jeo-compatible project anchors.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEX_HELPER="$SCRIPT_DIR/mex.sh"
INSTALLER="$SCRIPT_DIR/install.sh"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mex-skill-test.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

FAKE_HOME="$TMP_ROOT/home"
FAKE_BIN="$TMP_ROOT/bin"
PROJECT="$TMP_ROOT/project"
LOG="$TMP_ROOT/mex-calls.log"
mkdir -p "$FAKE_HOME/.local/bin" "$FAKE_BIN" "$PROJECT/.mex"

cat > "$FAKE_HOME/.local/bin/mex-agent" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "--version" ]; then
  echo "0.7.1"
  exit 0
fi
printf '%s\n' "$*" >> "${MEX_TEST_LOG:?}"
SH
chmod +x "$FAKE_HOME/.local/bin/mex-agent"

cat > "$FAKE_BIN/mex" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "pdfTeX 3.141592653 (TeX Live test fixture)"
  exit 0
fi
echo "wrong mex binary invoked" >&2
exit 91
SH
chmod +x "$FAKE_BIN/mex"

cat > "$PROJECT/.mex/AGENTS.md" <<'MD'
# Fixture project memory
MD
cat > "$PROJECT/CLAUDE.md" <<'MD'
# Fixture root anchor

Use `mex-agent`, never bare `mex`, for project memory commands.
MD

git -C "$PROJECT" init -q

TEST_PATH="$FAKE_BIN:/Users/jangyoung/.aside/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export MEX_TEST_LOG="$LOG"

# A minimal agent PATH intentionally omits ~/.local/bin. The helper must still
# discover the conventional ~/.local/bin/mex-agent wrapper and ignore TeX mex.
DOCTOR_OUTPUT="$(HOME="$FAKE_HOME" PATH="$TEST_PATH" bash "$MEX_HELPER" doctor "$PROJECT")"
printf '%s\n' "$DOCTOR_OUTPUT" | awk '/ok    mex-agent/ { found=1 } END { exit found ? 0 : 1 }'
printf '%s\n' "$DOCTOR_OUTPUT" | awk '/WARN  bare mex/ { found=1 } END { exit found ? 0 : 1 }'

HOME="$FAKE_HOME" PATH="$TEST_PATH" bash "$MEX_HELPER" check "$PROJECT" --quiet
awk '$0 == "check --quiet" { found=1 } END { exit found ? 0 : 1 }' "$LOG"

# Existing .mex/ scaffolds skip setup. The installer must still create the
# root AGENTS.md bridge that jeo/gjc/jeopi load.
HOME="$FAKE_HOME" PATH="$TEST_PATH" \
  bash "$INSTALLER" --skip-skill --tool codex "$PROJECT"

test -f "$PROJECT/AGENTS.md"
cmp -s "$PROJECT/CLAUDE.md" "$PROJECT/AGENTS.md"
awk '/mex-agent/ { found=1 } END { exit found ? 0 : 1 }' "$PROJECT/AGENTS.md"
awk '$0 == "graph" { graph=1 } $0 == "check" { check=1 } END { exit graph && check ? 0 : 1 }' "$LOG"

# A valid upstream bare `mex` is not enough: the installer must also expose an
# unambiguous mex-agent wrapper because generated anchors use that name.
BARE_HOME="$TMP_ROOT/bare-home"
BARE_BIN="$TMP_ROOT/bare-bin"
BARE_PROJECT="$TMP_ROOT/bare-project"
FAKE_CLI="$TMP_ROOT/fake-cli.js"
mkdir -p "$BARE_HOME" "$BARE_BIN" "$BARE_PROJECT/.mex"
printf '# Fixture project memory\n' > "$BARE_PROJECT/.mex/AGENTS.md"
git -C "$BARE_PROJECT" init -q

cat > "$BARE_BIN/mex" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "0.7.1"
  exit 0
fi
exit 0
SH
chmod +x "$BARE_BIN/mex"

cat > "$FAKE_CLI" <<'JS'
if (process.argv[2] === '--version') console.log('0.7.1');
JS

HOME="$BARE_HOME" PATH="$BARE_BIN:/Users/jangyoung/.aside/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  MEX_AGENT_CLI="$FAKE_CLI" MEX_AGENT_NODE="/Users/jangyoung/.aside/runtime/bin/node" \
  bash "$INSTALLER" --skip-skill --tool codex "$BARE_PROJECT"

test -x "$BARE_HOME/.local/bin/mex-agent"
test "$(HOME="$BARE_HOME" MEX_AGENT_CLI="$FAKE_CLI" MEX_AGENT_NODE="/Users/jangyoung/.aside/runtime/bin/node" \
  "$BARE_HOME/.local/bin/mex-agent" --version)" = "0.7.1"

echo "PASS: mex runtime resolution and jeo anchor regression tests"
