#!/usr/bin/env bash
# Focused isolated regression coverage for runtime configuration writers.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTATION="$ROOT/.agent-skills/agentation/scripts/setup-agentation-mcp.sh"
OBS_INSTALL="$ROOT/.agent-skills/obsidian-second-brain/scripts/install.sh"
PLAN_HOOK="$ROOT/.agent-skills/plannotator/scripts/setup-hook.sh"
PLAN_GEMINI="$ROOT/.agent-skills/plannotator/scripts/setup-gemini-hook.sh"
PLAN_OPENCODE="$ROOT/.agent-skills/plannotator/scripts/setup-opencode-plugin.sh"
VIBE_MCP="$ROOT/.agent-skills/vibe-kanban/scripts/mcp-setup.sh"
ROOT_INSTALLER="$ROOT/install.sh"
GUIDE="$ROOT/setup-all-skills-prompt.md"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/jeo-skills-config-test.XXXXXX")"
HOME="$WORK/home"
ORIGINAL_PATH="$PATH"
PATH="$WORK/bin:$ORIGINAL_PATH"
export HOME PATH
mkdir -p "$HOME" "$WORK/bin" "$WORK/tmp"

LAST_OUTPUT="$WORK/last-output"
LAST_STATUS=0
PASS_COUNT=0

cleanup() {
  rm -rf -- "$WORK"
}
trap cleanup EXIT

pass() {
  printf 'PASS: %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  [ -f "$LAST_OUTPUT" ] && { printf '%s\n' '--- command output ---' >&2; cat "$LAST_OUTPUT" >&2; }
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "required file missing: $1"
}

run_capture() {
  "$@" >"$LAST_OUTPUT" 2>&1
  LAST_STATUS=$?
}

expect_status() {
  [ "$LAST_STATUS" -eq "$1" ] || fail "expected exit $1, got $LAST_STATUS: $2"
}

expect_output() {
  grep -Fq -- "$1" "$LAST_OUTPUT" || fail "expected command output to contain '$1': $2"
}

expect_no_completion() {
  if grep -Fq 'Setup Complete' "$LAST_OUTPUT"; then
    fail "failed setup falsely printed completion: $1"
  fi
}
expect_no_output() {
  if grep -Fq -- "$1" "$LAST_OUTPUT"; then
    fail "failed setup falsely printed '$1': $2"
  fi
}


mode_of() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

assert_json() {
  jq empty "$1" >/dev/null 2>&1 || fail "invalid JSON: $1"
}

assert_no_temp_for() {
  local parent="$1" name="$2"
  if find "$parent" -maxdepth 1 -name ".${name}.*" -print -quit | grep -q .; then
    fail "temporary config file leaked beside $parent/$name"
  fi
}

require_file "$AGENTATION"
require_file "$OBS_INSTALL"
require_file "$PLAN_GEMINI"
require_file "$PLAN_OPENCODE"
require_file "$VIBE_MCP"
require_file "$PLAN_HOOK"
require_file "$ROOT_INSTALLER"
require_file "$GUIDE"
command -v jq >/dev/null 2>&1 || fail 'jq is required for this isolated regression test'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required for this isolated regression test'

# JSON creation must produce valid configuration without using the real home.
run_capture /bin/bash "$AGENTATION" --claude
expect_status 0 'Agentation Claude config creation'
assert_json "$HOME/.claude/claude_desktop_config.json"
jq -e '.mcpServers.agentation.command == "npx" and .mcpServers.agentation.args == ["-y", "agentation-mcp", "server"]' \
  "$HOME/.claude/claude_desktop_config.json" >/dev/null || fail 'Agentation JSON creation omitted its MCP entry'
pass 'Agentation creates parseable JSON MCP configuration in isolated HOME'

# JSON merge must preserve an existing regular file's original permissions.
printf '%s\n' '{"mcpServers":{"existing":{"command":"keep"}}}' >"$HOME/.claude/claude_desktop_config.json"
chmod 640 "$HOME/.claude/claude_desktop_config.json"
run_capture /bin/bash "$AGENTATION" --claude
expect_status 0 'Agentation Claude config merge'
assert_json "$HOME/.claude/claude_desktop_config.json"
jq -e '.mcpServers.existing.command == "keep" and .mcpServers.agentation.command == "npx"' \
  "$HOME/.claude/claude_desktop_config.json" >/dev/null || fail 'Agentation JSON merge lost an existing entry or its MCP entry'
[ "$(mode_of "$HOME/.claude/claude_desktop_config.json")" = 640 ] || fail 'Agentation JSON merge did not preserve mode 640'
pass 'Agentation merges JSON while preserving mode 640'

# The Codex writer must create the exact named table and preserve mode on append.
mkdir -p "$HOME/.codex"
printf '%s\n' 'model = "test"' >"$HOME/.codex/config.toml"
chmod 600 "$HOME/.codex/config.toml"
run_capture /bin/bash "$AGENTATION" --codex
expect_status 0 'Agentation Codex config append'
python3 - "$HOME/.codex/config.toml" <<'PY' || fail 'Agentation Codex config is not valid TOML with named agentation section'
import sys
import tomllib

with open(sys.argv[1], 'rb') as config:
    data = tomllib.load(config)
entry = data['mcp_servers']['agentation']
assert entry['command'] == 'npx'
assert entry['args'] == ['-y', 'agentation-mcp', 'server']
PY
[ "$(mode_of "$HOME/.codex/config.toml")" = 600 ] || fail 'Agentation Codex append did not preserve mode 600'
run_capture /bin/bash "$AGENTATION" --codex
expect_status 0 'Agentation Codex idempotent rerun'
[ "$(grep -Fxc '[mcp_servers.agentation]' "$HOME/.codex/config.toml")" -eq 1 ] || fail 'Agentation Codex writer duplicated or broke the named table'
pass 'Agentation writes one parseable named Codex MCP table and preserves mode 600'

# A real config symlink must fail without mutating its linked target or claiming completion.
mkdir -p "$HOME/.config/opencode"
printf '%s\n' '{"sentinel":"unchanged"}' >"$WORK/opencode-target.json"
cp "$WORK/opencode-target.json" "$WORK/opencode-before.json"
ln -s "$WORK/opencode-target.json" "$HOME/.config/opencode/opencode.json"
run_capture /bin/bash "$AGENTATION" --opencode
expect_status 1 'Agentation real symlink rejection'
expect_no_completion 'real symlink rejection'
cmp -s "$WORK/opencode-before.json" "$WORK/opencode-target.json" || fail 'Agentation mutated the target of a config symlink'
pass 'Agentation rejects real config symlinks without target mutation or completion'

# A dangling symlink must remain dangling and must not cause target creation.
mkdir -p "$HOME/.gemini"
ln -s "$WORK/missing-gemini-target.json" "$HOME/.gemini/settings.json"
run_capture /bin/bash "$AGENTATION" --gemini
expect_status 1 'Agentation dangling symlink rejection'
expect_no_completion 'dangling symlink rejection'
[ -L "$HOME/.gemini/settings.json" ] || fail 'Agentation replaced a dangling config symlink'
[ ! -e "$WORK/missing-gemini-target.json" ] || fail 'Agentation created a dangling symlink target'
pass 'Agentation rejects dangling config symlinks without completion'

# Malformed JSON must remain unchanged, fail, and clean its same-directory temp file.
printf '%s' '{"mcpServers":' >"$HOME/.claude/claude_desktop_config.json"
cp "$HOME/.claude/claude_desktop_config.json" "$WORK/malformed-before.json"
run_capture /bin/bash "$AGENTATION" --claude
expect_status 1 'Agentation malformed JSON rejection'
expect_no_completion 'malformed JSON rejection'
cmp -s "$WORK/malformed-before.json" "$HOME/.claude/claude_desktop_config.json" || fail 'Agentation changed malformed JSON after a failed merge'
assert_no_temp_for "$HOME/.claude" 'claude_desktop_config.json'
pass 'Agentation leaves malformed JSON unchanged and removes its temporary file'

# Another directly executable writer: plannotator hook merge with only its CLI stubbed.
cat >"$WORK/bin/plannotator" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 700 "$WORK/bin/plannotator"
printf '%s\n' '{"hooks":{"Other":[]}}' >"$HOME/.claude/settings.json"
chmod 640 "$HOME/.claude/settings.json"
run_capture /bin/bash "$PLAN_HOOK"
expect_status 0 'plannotator hook merge'
assert_json "$HOME/.claude/settings.json"
python3 - "$HOME/.claude/settings.json" <<'PY' || fail 'plannotator hook merge omitted ExitPlanMode command'
import json
import sys

with open(sys.argv[1]) as settings_file:
    settings = json.load(settings_file)
assert settings['hooks']['Other'] == []
assert any(
    hook.get('matcher') == 'ExitPlanMode'
    and any(command.get('command') == 'plannotator' for command in hook.get('hooks', []))
    for hook in settings['hooks']['PermissionRequest']
)
PY
[ "$(mode_of "$HOME/.claude/settings.json")" = 640 ] || fail 'plannotator hook merge did not preserve mode 640'
pass 'plannotator hook writer merges JSON and preserves mode 640'

# A symlinked Claude parent directory is supported when its settings leaf is regular.
HOOK_PARENT_HOME="$WORK/plannotator-hook-parent-home"
HOOK_PARENT_TARGET="$WORK/plannotator-hook-parent-target"
mkdir -p "$HOOK_PARENT_HOME" "$HOOK_PARENT_TARGET"
ln -s "$HOOK_PARENT_TARGET" "$HOOK_PARENT_HOME/.claude"
run_capture env HOME="$HOOK_PARENT_HOME" PATH="$PATH" /bin/bash "$PLAN_HOOK"
expect_status 0 'plannotator hook symlinked parent directory'
[ -L "$HOOK_PARENT_HOME/.claude" ] && [ -d "$HOOK_PARENT_HOME/.claude" ] || fail 'plannotator hook did not retain the managed Claude parent symlink'
[ -f "$HOOK_PARENT_TARGET/settings.json" ] && [ ! -L "$HOOK_PARENT_TARGET/settings.json" ] || fail 'plannotator hook did not create a regular settings leaf in the managed Claude directory'
assert_json "$HOOK_PARENT_TARGET/settings.json"
jq -e 'any(.hooks.PermissionRequest[]?; .matcher == "ExitPlanMode")' "$HOOK_PARENT_TARGET/settings.json" >/dev/null || fail 'plannotator hook symlinked parent settings missing ExitPlanMode entry'
pass 'plannotator hook writes a regular settings leaf through a symlinked Claude parent'


# All direct writers below use the isolated HOME; only their unavailable CLIs are stubbed.
cat >"$WORK/bin/npx" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 700 "$WORK/bin/npx"

# The standard plannotator hook writer also rejects both symlink forms.
rm -f "$HOME/.claude/settings.json"
printf '%s\n' '{"sentinel":"hook-target"}' >"$WORK/plan-hook-target.json"
cp "$WORK/plan-hook-target.json" "$WORK/plan-hook-before.json"
ln -s "$WORK/plan-hook-target.json" "$HOME/.claude/settings.json"
run_capture /bin/bash "$PLAN_HOOK"
expect_status 1 'plannotator hook real symlink rejection'
cmp -s "$WORK/plan-hook-before.json" "$WORK/plan-hook-target.json" || fail 'plannotator hook mutated real symlink target'
rm -f "$HOME/.claude/settings.json"
ln -s "$WORK/plan-hook-dangling.json" "$HOME/.claude/settings.json"
run_capture /bin/bash "$PLAN_HOOK"
expect_status 1 'plannotator hook dangling symlink rejection'
[ -L "$HOME/.claude/settings.json" ] && [ ! -e "$WORK/plan-hook-dangling.json" ] || fail 'plannotator hook replaced dangling symlink'
pass 'plannotator hook rejects real and dangling symlinked configs'

# Gemini hook writer: successful regular merge plus both symlink rejection paths.
GEMINI_HOME="$WORK/plannotator-gemini-home"
mkdir -p "$GEMINI_HOME/.gemini"
printf '%s\n' '{"hooks":{"Other":[]}}' >"$GEMINI_HOME/.gemini/settings.json"
chmod 640 "$GEMINI_HOME/.gemini/settings.json"
run_capture env HOME="$GEMINI_HOME" PATH="$PATH" /bin/bash "$PLAN_GEMINI" --hook-only
expect_status 0 'plannotator Gemini hook merge'
assert_json "$GEMINI_HOME/.gemini/settings.json"
jq -e 'any(.hooks.PermissionRequest[]?; .matcher == "ExitPlanMode")' "$GEMINI_HOME/.gemini/settings.json" >/dev/null || fail 'plannotator Gemini hook missing ExitPlanMode entry'
[ "$(mode_of "$GEMINI_HOME/.gemini/settings.json")" = 640 ] || fail 'plannotator Gemini hook lost mode 640'

# A symlinked Gemini parent directory is supported when its settings leaf is regular.
GEMINI_PARENT_HOME="$WORK/plannotator-gemini-parent-home"
GEMINI_PARENT_TARGET="$WORK/plannotator-gemini-parent-target"
mkdir -p "$GEMINI_PARENT_HOME" "$GEMINI_PARENT_TARGET"
ln -s "$GEMINI_PARENT_TARGET" "$GEMINI_PARENT_HOME/.gemini"
run_capture env HOME="$GEMINI_PARENT_HOME" PATH="$PATH" /bin/bash "$PLAN_GEMINI" --hook-only
expect_status 0 'plannotator Gemini symlinked parent directory'
[ -L "$GEMINI_PARENT_HOME/.gemini" ] && [ -d "$GEMINI_PARENT_HOME/.gemini" ] || fail 'plannotator Gemini hook did not retain the managed Gemini parent symlink'
[ -f "$GEMINI_PARENT_TARGET/settings.json" ] && [ ! -L "$GEMINI_PARENT_TARGET/settings.json" ] || fail 'plannotator Gemini hook did not create a regular settings leaf in the managed Gemini directory'
assert_json "$GEMINI_PARENT_TARGET/settings.json"
jq -e 'any(.hooks.PermissionRequest[]?; .matcher == "ExitPlanMode")' "$GEMINI_PARENT_TARGET/settings.json" >/dev/null || fail 'plannotator Gemini symlinked parent settings missing ExitPlanMode entry'
pass 'plannotator Gemini hook writes a regular settings leaf through a symlinked Gemini parent'

rm -f "$GEMINI_HOME/.gemini/settings.json"
printf '%s\n' '{"sentinel":"gemini-real"}' >"$WORK/gemini-real-target.json"
cp "$WORK/gemini-real-target.json" "$WORK/gemini-real-before.json"
ln -s "$WORK/gemini-real-target.json" "$GEMINI_HOME/.gemini/settings.json"
run_capture env HOME="$GEMINI_HOME" PATH="$PATH" /bin/bash "$PLAN_GEMINI" --hook-only
expect_status 1 'plannotator Gemini real symlink rejection'
cmp -s "$WORK/gemini-real-before.json" "$WORK/gemini-real-target.json" || fail 'plannotator Gemini hook mutated real symlink target'
rm -f "$GEMINI_HOME/.gemini/settings.json"
ln -s "$WORK/gemini-dangling-target.json" "$GEMINI_HOME/.gemini/settings.json"
run_capture env HOME="$GEMINI_HOME" PATH="$PATH" /bin/bash "$PLAN_GEMINI" --hook-only
expect_status 1 'plannotator Gemini dangling symlink rejection'
[ -L "$GEMINI_HOME/.gemini/settings.json" ] && [ ! -e "$WORK/gemini-dangling-target.json" ] || fail 'plannotator Gemini hook replaced dangling symlink'
pass 'plannotator Gemini writer merges regular config and rejects both symlink forms'

# OpenCode plugin writer: project config merge plus real and dangling symlink protection.
OPENCODE_HOME="$WORK/plannotator-opencode-home"
OPENCODE_PROJECT="$WORK/plannotator-opencode-project"
mkdir -p "$OPENCODE_HOME" "$OPENCODE_PROJECT"
printf '%s\n' '{"plugin":[]}' >"$OPENCODE_PROJECT/opencode.json"
chmod 640 "$OPENCODE_PROJECT/opencode.json"
run_capture env HOME="$OPENCODE_HOME" PATH="$PATH" /bin/bash "$PLAN_OPENCODE" "--project-dir=$OPENCODE_PROJECT"
expect_status 0 'plannotator OpenCode plugin merge'
assert_json "$OPENCODE_PROJECT/opencode.json"
jq -e '.plugin | index("@plannotator/opencode@latest") != null' "$OPENCODE_PROJECT/opencode.json" >/dev/null || fail 'plannotator OpenCode plugin missing from regular config'
[ "$(mode_of "$OPENCODE_PROJECT/opencode.json")" = 640 ] || fail 'plannotator OpenCode plugin merge lost mode 640'

# A symlinked OpenCode project root writes regular configuration and command leaves in its targets.
OPENCODE_PROJECT_PARENT_HOME="$WORK/plannotator-opencode-project-parent-home"
OPENCODE_PROJECT_PARENT_XDG="$WORK/plannotator-opencode-project-parent-xdg"
OPENCODE_PROJECT_PARENT_TARGET="$WORK/plannotator-opencode-project-parent-target"
OPENCODE_PROJECT_PARENT_LINK="$WORK/plannotator-opencode-project-parent-link"
mkdir -p "$OPENCODE_PROJECT_PARENT_HOME" "$OPENCODE_PROJECT_PARENT_XDG" "$OPENCODE_PROJECT_PARENT_TARGET"
ln -s "$OPENCODE_PROJECT_PARENT_TARGET" "$OPENCODE_PROJECT_PARENT_LINK"
run_capture env HOME="$OPENCODE_PROJECT_PARENT_HOME" XDG_CONFIG_HOME="$OPENCODE_PROJECT_PARENT_XDG" PATH="$PATH" /bin/bash "$PLAN_OPENCODE" "--project-dir=$OPENCODE_PROJECT_PARENT_LINK"
expect_status 0 'plannotator OpenCode symlinked project parent'
[ -L "$OPENCODE_PROJECT_PARENT_LINK" ] && [ -d "$OPENCODE_PROJECT_PARENT_LINK" ] || fail 'plannotator OpenCode did not retain the managed project parent symlink'
[ -f "$OPENCODE_PROJECT_PARENT_TARGET/opencode.json" ] && [ ! -L "$OPENCODE_PROJECT_PARENT_TARGET/opencode.json" ] || fail 'plannotator OpenCode did not create a regular config leaf in the managed project directory'
assert_json "$OPENCODE_PROJECT_PARENT_TARGET/opencode.json"
jq -e '.plugin | index("@plannotator/opencode@latest") != null' "$OPENCODE_PROJECT_PARENT_TARGET/opencode.json" >/dev/null || fail 'plannotator OpenCode symlinked project config missing plugin entry'
for command in plannotator-review.md plannotator-annotate.md; do
  [ -f "$OPENCODE_PROJECT_PARENT_XDG/opencode/command/$command" ] && [ ! -L "$OPENCODE_PROJECT_PARENT_XDG/opencode/command/$command" ] || fail "plannotator OpenCode did not create regular $command through a symlinked project parent"
done
grep -Fq -- 'plannotator review' "$OPENCODE_PROJECT_PARENT_XDG/opencode/command/plannotator-review.md" || fail 'plannotator OpenCode project-parent review command has unexpected content'
grep -Fq -- 'plannotator annotate "$ARGUMENTS"' "$OPENCODE_PROJECT_PARENT_XDG/opencode/command/plannotator-annotate.md" || fail 'plannotator OpenCode project-parent annotate command has unexpected content'
pass 'plannotator OpenCode writes regular leaves through a symlinked project parent'

# A symlinked XDG OpenCode parent directory writes regular command leaves in its target.
OPENCODE_XDG_PARENT_HOME="$WORK/plannotator-opencode-xdg-parent-home"
OPENCODE_XDG_PARENT_CONFIG="$WORK/plannotator-opencode-xdg-parent-config"
OPENCODE_XDG_PARENT_TARGET="$WORK/plannotator-opencode-xdg-parent-target"
OPENCODE_XDG_PARENT_PROJECT="$WORK/plannotator-opencode-xdg-parent-project"
mkdir -p "$OPENCODE_XDG_PARENT_HOME" "$OPENCODE_XDG_PARENT_CONFIG" "$OPENCODE_XDG_PARENT_TARGET" "$OPENCODE_XDG_PARENT_PROJECT"
ln -s "$OPENCODE_XDG_PARENT_TARGET" "$OPENCODE_XDG_PARENT_CONFIG/opencode"
run_capture env HOME="$OPENCODE_XDG_PARENT_HOME" XDG_CONFIG_HOME="$OPENCODE_XDG_PARENT_CONFIG" PATH="$PATH" /bin/bash "$PLAN_OPENCODE" "--project-dir=$OPENCODE_XDG_PARENT_PROJECT"
expect_status 0 'plannotator OpenCode symlinked XDG parent'
[ -L "$OPENCODE_XDG_PARENT_CONFIG/opencode" ] && [ -d "$OPENCODE_XDG_PARENT_CONFIG/opencode" ] || fail 'plannotator OpenCode did not retain the managed XDG OpenCode parent symlink'
[ -f "$OPENCODE_XDG_PARENT_PROJECT/opencode.json" ] && [ ! -L "$OPENCODE_XDG_PARENT_PROJECT/opencode.json" ] || fail 'plannotator OpenCode did not create a regular config leaf with a symlinked XDG parent'
assert_json "$OPENCODE_XDG_PARENT_PROJECT/opencode.json"
jq -e '.plugin | index("@plannotator/opencode@latest") != null' "$OPENCODE_XDG_PARENT_PROJECT/opencode.json" >/dev/null || fail 'plannotator OpenCode XDG-parent config missing plugin entry'
for command in plannotator-review.md plannotator-annotate.md; do
  [ -f "$OPENCODE_XDG_PARENT_TARGET/command/$command" ] && [ ! -L "$OPENCODE_XDG_PARENT_TARGET/command/$command" ] || fail "plannotator OpenCode did not create regular $command in the managed XDG OpenCode directory"
done
grep -Fq -- 'plannotator review' "$OPENCODE_XDG_PARENT_TARGET/command/plannotator-review.md" || fail 'plannotator OpenCode XDG-parent review command has unexpected content'
grep -Fq -- 'plannotator annotate "$ARGUMENTS"' "$OPENCODE_XDG_PARENT_TARGET/command/plannotator-annotate.md" || fail 'plannotator OpenCode XDG-parent annotate command has unexpected content'
pass 'plannotator OpenCode writes regular leaves through a symlinked XDG OpenCode parent'

rm -f "$OPENCODE_PROJECT/opencode.json"
printf '%s\n' '{"sentinel":"opencode-real"}' >"$WORK/opencode-plugin-real-target.json"
cp "$WORK/opencode-plugin-real-target.json" "$WORK/opencode-plugin-real-before.json"
ln -s "$WORK/opencode-plugin-real-target.json" "$OPENCODE_PROJECT/opencode.json"
run_capture env HOME="$OPENCODE_HOME" PATH="$PATH" /bin/bash "$PLAN_OPENCODE" "--project-dir=$OPENCODE_PROJECT"
expect_status 1 'plannotator OpenCode real symlink rejection'
cmp -s "$WORK/opencode-plugin-real-before.json" "$WORK/opencode-plugin-real-target.json" || fail 'plannotator OpenCode plugin mutated real symlink target'
rm -f "$OPENCODE_PROJECT/opencode.json"
ln -s "$WORK/opencode-plugin-dangling-target.json" "$OPENCODE_PROJECT/opencode.json"
run_capture env HOME="$OPENCODE_HOME" PATH="$PATH" /bin/bash "$PLAN_OPENCODE" "--project-dir=$OPENCODE_PROJECT"
expect_status 1 'plannotator OpenCode dangling symlink rejection'
[ -L "$OPENCODE_PROJECT/opencode.json" ] && [ ! -e "$WORK/opencode-plugin-dangling-target.json" ] || fail 'plannotator OpenCode plugin replaced dangling symlink'
pass 'plannotator OpenCode writer merges regular config and rejects both symlink forms'

# Vibe Kanban writer: regular merge plus real and dangling symlink protection.
VIBE_HOME="$WORK/vibe-home"
mkdir -p "$VIBE_HOME/.claude"
printf '%s\n' '{"mcpServers":{}}' >"$VIBE_HOME/.claude/claude_desktop_config.json"
chmod 640 "$VIBE_HOME/.claude/claude_desktop_config.json"
run_capture env HOME="$VIBE_HOME" PATH="$PATH" /bin/bash "$VIBE_MCP" --claude
expect_status 0 'Vibe Kanban regular config merge'
assert_json "$VIBE_HOME/.claude/claude_desktop_config.json"
jq -e '.mcpServers["vibe-kanban"].command == "npx"' "$VIBE_HOME/.claude/claude_desktop_config.json" >/dev/null || fail 'Vibe Kanban MCP entry missing from regular config'
[ "$(mode_of "$VIBE_HOME/.claude/claude_desktop_config.json")" = 640 ] || fail 'Vibe Kanban merge lost mode 640'
rm -f "$VIBE_HOME/.claude/claude_desktop_config.json"
printf '%s\n' '{"sentinel":"vibe-real"}' >"$WORK/vibe-real-target.json"
cp "$WORK/vibe-real-target.json" "$WORK/vibe-real-before.json"
ln -s "$WORK/vibe-real-target.json" "$VIBE_HOME/.claude/claude_desktop_config.json"
run_capture env HOME="$VIBE_HOME" PATH="$PATH" /bin/bash "$VIBE_MCP" --claude
expect_status 1 'Vibe Kanban real symlink rejection'
cmp -s "$WORK/vibe-real-before.json" "$WORK/vibe-real-target.json" || fail 'Vibe Kanban mutated real symlink target'
rm -f "$VIBE_HOME/.claude/claude_desktop_config.json"
ln -s "$WORK/vibe-dangling-target.json" "$VIBE_HOME/.claude/claude_desktop_config.json"
run_capture env HOME="$VIBE_HOME" PATH="$PATH" /bin/bash "$VIBE_MCP" --claude
expect_status 1 'Vibe Kanban dangling symlink rejection'
[ -L "$VIBE_HOME/.claude/claude_desktop_config.json" ] && [ ! -e "$WORK/vibe-dangling-target.json" ] || fail 'Vibe Kanban replaced dangling symlink'
# Vibe Kanban's independent Codex/TOML path must also preserve regular config
# safety rather than relying on the Claude/JSON branch above.
mkdir -p "$VIBE_HOME/.codex"
printf '%s\n' 'model = "test"' >"$VIBE_HOME/.codex/config.toml"
chmod 600 "$VIBE_HOME/.codex/config.toml"
run_capture env HOME="$VIBE_HOME" PATH="$PATH" /bin/bash "$VIBE_MCP" --codex
expect_status 0 'Vibe Kanban Codex config append'
python3 - "$VIBE_HOME/.codex/config.toml" <<'PY' || fail 'Vibe Kanban Codex config is not valid TOML'
import sys
import tomllib

with open(sys.argv[1], "rb") as f:
    config = tomllib.load(f)
assert any(
    entry.get("name") == "vibe-kanban"
    and entry.get("command") == "npx"
    for entry in config.get("mcp_servers", [])
)
PY
[ "$(mode_of "$VIBE_HOME/.codex/config.toml")" = 600 ] || fail 'Vibe Kanban Codex append lost mode 600'
printf '%s' 'model = [' >"$VIBE_HOME/.codex/config.toml"
cp "$VIBE_HOME/.codex/config.toml" "$WORK/vibe-codex-malformed-before.toml"
run_capture env HOME="$VIBE_HOME" PATH="$PATH" /bin/bash "$VIBE_MCP" --codex
expect_status 1 'Vibe Kanban malformed Codex TOML rejection'
expect_no_output 'MCP 설정 완료!' 'Vibe Kanban malformed Codex TOML rejection'
cmp -s "$WORK/vibe-codex-malformed-before.toml" "$VIBE_HOME/.codex/config.toml" || fail 'Vibe Kanban changed malformed Codex TOML'
assert_no_temp_for "$VIBE_HOME/.codex" 'config.toml'
pass 'Vibe Kanban writer protects both JSON and TOML config paths'

# Obsidian second brain: two secure backups, a failed merge that preserves the original, and both symlink forms.
OBS_HOME="$WORK/obsidian-home"
OBS_CONFIG="$OBS_HOME/.jeo/config.json"
OBS_VAULT="$OBS_HOME/vault"
mkdir -p "$OBS_HOME/.jeo" "$OBS_VAULT"
printf '%s\n' '{"hooks":{"hooks":[]}}' >"$OBS_CONFIG"
chmod 640 "$OBS_CONFIG"
run_capture env HOME="$OBS_HOME" PATH="$PATH" JEO=1 JEO_CONFIG="$OBS_CONFIG" VAULT="$OBS_VAULT" WITH_UPSTREAM=0 /bin/bash "$OBS_INSTALL"
expect_status 0 'Obsidian second brain first hook merge'
run_capture env HOME="$OBS_HOME" PATH="$PATH" JEO=1 JEO_CONFIG="$OBS_CONFIG" VAULT="$OBS_VAULT" WITH_UPSTREAM=0 /bin/bash "$OBS_INSTALL"
expect_status 0 'Obsidian second brain second hook merge'
assert_json "$OBS_CONFIG"
jq -e 'any(.hooks.hooks[]?; (.run | test("jeo-validate-ai-first")))' "$OBS_CONFIG" >/dev/null || fail 'Obsidian second brain hook missing from regular config'
[ "$(mode_of "$OBS_CONFIG")" = 640 ] || fail 'Obsidian second brain merge lost mode 640'
[ "$(find "$OBS_HOME/.jeo" -maxdepth 1 -type f -name '.config.json.bak.osb.*' | wc -l | tr -d ' ')" -eq 2 ] || fail 'Obsidian second brain did not create two unique non-clobbering backups'
printf '%s' '{"hooks":' >"$OBS_CONFIG"
cp "$OBS_CONFIG" "$WORK/obsidian-malformed-before.json"
run_capture env HOME="$OBS_HOME" PATH="$PATH" JEO=1 JEO_CONFIG="$OBS_CONFIG" VAULT="$OBS_VAULT" WITH_UPSTREAM=0 /bin/bash "$OBS_INSTALL"
expect_status 1 'Obsidian second brain malformed merge failure'
cmp -s "$WORK/obsidian-malformed-before.json" "$OBS_CONFIG" || fail 'Obsidian second brain changed config after failed merge'
OBS_LINK_HOME="$WORK/obsidian-link-home"
mkdir -p "$OBS_LINK_HOME/.jeo" "$OBS_LINK_HOME/vault"
printf '%s\n' '{"sentinel":"obsidian-real"}' >"$WORK/obsidian-real-target.json"
cp "$WORK/obsidian-real-target.json" "$WORK/obsidian-real-before.json"
ln -s "$WORK/obsidian-real-target.json" "$OBS_LINK_HOME/.jeo/config.json"
run_capture env HOME="$OBS_LINK_HOME" PATH="$PATH" JEO=1 JEO_CONFIG="$OBS_LINK_HOME/.jeo/config.json" VAULT="$OBS_LINK_HOME/vault" WITH_UPSTREAM=0 /bin/bash "$OBS_INSTALL"
expect_status 1 'Obsidian second brain real symlink rejection'
cmp -s "$WORK/obsidian-real-before.json" "$WORK/obsidian-real-target.json" || fail 'Obsidian second brain mutated real symlink target'
rm -f "$OBS_LINK_HOME/.jeo/config.json"
ln -s "$WORK/obsidian-dangling-target.json" "$OBS_LINK_HOME/.jeo/config.json"
run_capture env HOME="$OBS_LINK_HOME" PATH="$PATH" JEO=1 JEO_CONFIG="$OBS_LINK_HOME/.jeo/config.json" VAULT="$OBS_LINK_HOME/vault" WITH_UPSTREAM=0 /bin/bash "$OBS_INSTALL"
expect_status 1 'Obsidian second brain dangling symlink rejection'
[ -L "$OBS_LINK_HOME/.jeo/config.json" ] && [ ! -e "$WORK/obsidian-dangling-target.json" ] || fail 'Obsidian second brain replaced dangling symlink'
pass 'Obsidian second brain preserves backups and rejects failed or symlinked config updates'

# Every changed shell writer must remain parseable.
for writer in \
  "$ROOT_INSTALLER" \
  "$AGENTATION" \
  "$ROOT/.agent-skills/obsidian-second-brain/scripts/install.sh" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-hook.sh" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-gemini-hook.sh" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-opencode-plugin.sh" \
  "$ROOT/.agent-skills/vibe-kanban/scripts/mcp-setup.sh"; do
  /bin/bash -n "$writer" || fail "shell syntax invalid: $writer"
done
pass 'all changed runtime shell writers pass bash syntax validation'

# Extract the seven hardened setup-guide shell sections and syntax-check each one.
GUIDE_DIR="$WORK/guide-shell"
mkdir -p "$GUIDE_DIR"
python3 - "$GUIDE" "$GUIDE_DIR" <<'PY' || fail 'could not extract hardened shell fences from setup guide'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
destination = Path(sys.argv[2])
in_block = False
blocks = []
current = []
for line in source.splitlines(keepends=True):
    marker = line.strip()
    if not in_block and marker in {'```bash', '```sh'}:
        in_block = True
        current = []
    elif in_block and marker == '```':
        blocks.append(''.join(current))
        in_block = False
    elif in_block:
        current.append(line)
if in_block:
    raise SystemExit('unterminated shell fence')

required_markers = (
    '=== Installing ooo (Ouroboros) ===',
    '=== Registering semble MCP ===',
    '=== Platform Plugin Setup ===',
    '=== Configuring jeo-code (jeo) rules + hooks ===',
    '=== Configuring pi (jeo-pi) rules + MCP ===',
    '=== Configuring jeopi (jeo-pi spec-first) hooks ===',
    '# Re-use PLATFORM / _HOME / SKILLS_ROOT from Step 0 if already set',
)
for index, marker in enumerate(required_markers, 1):
    matches = [block for block in blocks if marker in block]
    if len(matches) != 1:
        raise SystemExit(f'expected one fenced shell section for {marker!r}, found {len(matches)}')
    (destination / f'{index:02d}.sh').write_text(matches[0])
PY
for snippet in "$GUIDE_DIR"/*.sh; do
  /bin/bash -n "$snippet" || fail "hardened setup-guide shell fence is invalid: $snippet"
done
pass 'seven extracted hardened setup-guide shell sections are syntactically valid'

# Execute guide code fences in a minimal PATH. Stubs only replace installers/CLIs;
# jq, Python, and the filesystem tools remain real and all homes are disposable.
GUIDE_BIN="$WORK/guide-bin"
GUIDE_PATH="$GUIDE_BIN:/opt/homebrew/bin:/usr/bin:/bin"
mkdir -p "$GUIDE_BIN"
for tool in pip3 uvx semble claude codex npm jeo pi jeopi rtk npx; do
  cat >"$GUIDE_BIN/$tool" <<'EOF'
#!/bin/sh
exit 0
EOF
  chmod 700 "$GUIDE_BIN/$tool"
done
cat >"$GUIDE_BIN/omx" <<'EOF'
#!/bin/sh
if [ "${1:-}" = setup ]; then
  printf '%s\n' setup >>"$JEO_TEST_OMX_LOG"
fi
exit 0
EOF
chmod 700 "$GUIDE_BIN/omx"

run_guide() {
  local guide_home="$1" section="$2"
  HOME="$guide_home" _HOME="$guide_home" PATH="$GUIDE_PATH" PLATFORM=macos \
    SKILLS_ROOT="$guide_home/.agents/skills" OOO_GIT_INTERVIEW=0 OOO_SPEC_KIT=0 OOO_CLI_ANYTHING=0 \
    JEO_TEST_OMX_LOG="$WORK/omx-invocations.log" /bin/bash "$GUIDE_DIR/$section" >"$LAST_OUTPUT" 2>&1
  LAST_STATUS=$?
}

assert_guide_symlinks() {
  local label="$1" section="$2" relative_config="$3"
  local guide_home="$WORK/guide-link-$label"
  local config="$guide_home/$relative_config"
  local target="$WORK/guide-$label-real-target"
  local missing="$WORK/guide-$label-dangling-target"

  mkdir -p "$(dirname "$config")" "$guide_home/.pi/agent"
  printf '%s\n' "{\"sentinel\":\"$label\"}" >"$target"
  cp "$target" "$target.before"
  ln -s "$target" "$config"
  run_guide "$guide_home" "$section"
  expect_status 1 "$label guide real symlink rejection"
  cmp -s "$target.before" "$target" || fail "$label guide writer mutated its real symlink target"
  rm -f "$config"
  ln -s "$missing" "$config"
  run_guide "$guide_home" "$section"
  expect_status 1 "$label guide dangling symlink rejection"
  [ -L "$config" ] && [ ! -e "$missing" ] || fail "$label guide writer replaced a dangling symlink"
}

# OOO and semble each own a direct Codex TOML writer in their guide section.
GUIDE_OOO_HOME="$WORK/guide-ooo-home"
mkdir -p "$GUIDE_OOO_HOME/.codex"
printf '%s\n' 'model = "test"' >"$GUIDE_OOO_HOME/.codex/config.toml"
chmod 640 "$GUIDE_OOO_HOME/.codex/config.toml"
run_guide "$GUIDE_OOO_HOME" 01.sh
expect_status 0 'OOO guide Codex TOML mutation'
python3 - "$GUIDE_OOO_HOME/.codex/config.toml" <<'PY' || fail 'OOO guide did not write parseable named Codex table'
import sys, tomllib
with open(sys.argv[1], 'rb') as config:
    data = tomllib.load(config)
assert data['mcp_servers']['ooo']['command'] == 'ouroboros'
PY
[ "$(mode_of "$GUIDE_OOO_HOME/.codex/config.toml")" = 640 ] || fail 'OOO guide Codex mutation lost mode 640'
assert_guide_symlinks ooo 01.sh '.codex/config.toml'
pass 'OOO guide Codex writer mutates regular TOML and rejects both symlink forms'

GUIDE_SEMBLE_HOME="$WORK/guide-semble-home"
mkdir -p "$GUIDE_SEMBLE_HOME/.codex"
printf '%s\n' 'model = "test"' >"$GUIDE_SEMBLE_HOME/.codex/config.toml"
chmod 640 "$GUIDE_SEMBLE_HOME/.codex/config.toml"
run_guide "$GUIDE_SEMBLE_HOME" 02.sh
expect_status 0 'semble guide Codex TOML mutation'
python3 - "$GUIDE_SEMBLE_HOME/.codex/config.toml" <<'PY' || fail 'semble guide did not write parseable named Codex table'
import sys, tomllib
with open(sys.argv[1], 'rb') as config:
    data = tomllib.load(config)
assert data['mcp_servers']['semble']['command'] == 'uvx'
PY
[ "$(mode_of "$GUIDE_SEMBLE_HOME/.codex/config.toml")" = 640 ] || fail 'semble guide Codex mutation lost mode 640'
assert_guide_symlinks semble 02.sh '.codex/config.toml'
pass 'semble guide Codex writer mutates regular TOML and rejects both symlink forms'

# OMX delegates successful config writing to the external omx CLI. Its local guide
# surface must nevertheless reject both symlink forms before invoking that CLI.
GUIDE_OMX_HOME="$WORK/guide-omx-home"
mkdir -p "$GUIDE_OMX_HOME/.codex"
printf '%s\n' 'model = "test"' >"$GUIDE_OMX_HOME/.codex/config.toml"
: >"$WORK/omx-invocations.log"
run_guide "$GUIDE_OMX_HOME" 03.sh
expect_status 0 'OMX guide external setup handoff'
[ "$(cat "$WORK/omx-invocations.log")" = setup ] || fail 'OMX guide did not hand regular config setup to omx'
omx_invocations_before_symlink_checks="$(wc -l <"$WORK/omx-invocations.log" | tr -d ' ')"
assert_guide_symlinks omx 03.sh '.codex/config.toml'
[ "$(wc -l <"$WORK/omx-invocations.log" | tr -d ' ')" = "$omx_invocations_before_symlink_checks" ] || fail 'OMX guide invoked external setup after rejecting a symlinked local config'
pass 'OMX guide invokes external setup only for a regular config and rejects both symlink forms'

# jeo, pi, and jeopi guide sections own JSON writers directly.
GUIDE_JEO_HOME="$WORK/guide-jeo-home"
mkdir -p "$GUIDE_JEO_HOME/.jeo"
printf '%s\n' '{"hooks":{"existing":[]}}' >"$GUIDE_JEO_HOME/.jeo/config.json"
chmod 640 "$GUIDE_JEO_HOME/.jeo/config.json"
run_guide "$GUIDE_JEO_HOME" 04.sh
expect_status 0 'jeo guide config merge'
assert_json "$GUIDE_JEO_HOME/.jeo/config.json"
jq -e '.hooks.enabled == true and (.hooks.hooks | length == 2)' "$GUIDE_JEO_HOME/.jeo/config.json" >/dev/null || fail 'jeo guide did not write its hook configuration'
[ "$(mode_of "$GUIDE_JEO_HOME/.jeo/config.json")" = 640 ] || fail 'jeo guide mutation lost mode 640'
assert_guide_symlinks jeo 04.sh '.jeo/config.json'
pass 'jeo guide writer mutates regular JSON and rejects both symlink forms'

GUIDE_PI_HOME="$WORK/guide-pi-home"
mkdir -p "$GUIDE_PI_HOME/.pi/agent"
printf '%s\n' '{"mcpServers":{"existing":{"command":"keep"}}}' >"$GUIDE_PI_HOME/.pi/agent/mcp.json"
chmod 640 "$GUIDE_PI_HOME/.pi/agent/mcp.json"
run_guide "$GUIDE_PI_HOME" 05.sh
expect_status 0 'pi guide MCP merge'
assert_json "$GUIDE_PI_HOME/.pi/agent/mcp.json"
jq -e '.mcpServers.existing.command == "keep" and .mcpServers.semble.command == "uvx"' "$GUIDE_PI_HOME/.pi/agent/mcp.json" >/dev/null || fail 'pi guide did not preserve and add MCP entries'
[ "$(mode_of "$GUIDE_PI_HOME/.pi/agent/mcp.json")" = 640 ] || fail 'pi guide mutation lost mode 640'
assert_guide_symlinks pi 05.sh '.pi/agent/mcp.json'
pass 'pi guide writer mutates regular JSON and rejects both symlink forms'

GUIDE_JEOPI_HOME="$WORK/guide-jeopi-home"
mkdir -p "$GUIDE_JEOPI_HOME/.jeopi"
printf '%s\n' '{"hooks":{"existing":[]}}' >"$GUIDE_JEOPI_HOME/.jeopi/config.json"
chmod 640 "$GUIDE_JEOPI_HOME/.jeopi/config.json"
run_guide "$GUIDE_JEOPI_HOME" 06.sh
expect_status 0 'jeopi guide config merge'
assert_json "$GUIDE_JEOPI_HOME/.jeopi/config.json"
jq -e '.hooks.enabled == true and (.hooks.hooks | length == 2)' "$GUIDE_JEOPI_HOME/.jeopi/config.json" >/dev/null || fail 'jeopi guide did not write its hook configuration'
[ "$(mode_of "$GUIDE_JEOPI_HOME/.jeopi/config.json")" = 640 ] || fail 'jeopi guide mutation lost mode 640'
assert_guide_symlinks jeopi 06.sh '.jeopi/config.json'
pass 'jeopi guide writer mutates regular JSON and rejects both symlink forms'

# Step 6 owns the Codex hooks.json writer. Its wrapper path remains isolated too.
GUIDE_STEP6_HOME="$WORK/guide-step6-home"
mkdir -p "$GUIDE_STEP6_HOME/.codex" "$GUIDE_STEP6_HOME/vaults/llm-wiki/scripts"
printf '%s\n' '#!/bin/sh' >"$GUIDE_STEP6_HOME/vaults/llm-wiki/scripts/ingest-prompt.py"
chmod 700 "$GUIDE_STEP6_HOME/vaults/llm-wiki/scripts/ingest-prompt.py"
printf '%s\n' '{"hooks":{}}' >"$GUIDE_STEP6_HOME/.codex/hooks.json"
chmod 640 "$GUIDE_STEP6_HOME/.codex/hooks.json"
run_guide "$GUIDE_STEP6_HOME" 07.sh
expect_status 0 'Step 6 guide Codex hooks merge'
assert_json "$GUIDE_STEP6_HOME/.codex/hooks.json"
jq -e '.hooks.UserPromptSubmit[0].hooks[0].command and .hooks.Stop[0].hooks[0].command' "$GUIDE_STEP6_HOME/.codex/hooks.json" >/dev/null || fail 'Step 6 guide did not write both Codex hook events'
[ "$(mode_of "$GUIDE_STEP6_HOME/.codex/hooks.json")" = 640 ] || fail 'Step 6 guide mutation lost mode 640'
assert_guide_symlinks step6 07.sh '.codex/hooks.json'
pass 'Step 6 guide hooks writer mutates regular JSON and rejects both symlink forms'

# Exercise the root installer's marker guard without calling its networked main().
ROOT_LIBRARY="$WORK/install-library.sh"
python3 - "$ROOT_INSTALLER" "$ROOT_LIBRARY" <<'PY' || fail 'could not isolate root installer cleanup guard'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text().splitlines(keepends=True)
if not source or source[-1].strip() != 'main "$@"':
    raise SystemExit('unexpected root installer entry point')
Path(sys.argv[2]).write_text(''.join(source[:-1]))
PY
UNOWNED_STAGE="$WORK/unowned-stage"
mkdir -p "$UNOWNED_STAGE"
if ! /bin/bash -c 'source "$1"; TEMP_DIR="$2"; cleanup; [ -d "$2" ]' bash "$ROOT_LIBRARY" "$UNOWNED_STAGE"; then
  fail 'root installer cleanup removed a directory without its ownership marker'
fi

# Exercise the root installer through a git stub: no clone/network, unique staging, cleanup on failure.
ROOT_BIN="$WORK/root-bin"
mkdir -p "$ROOT_BIN"
cat >"$ROOT_BIN/git" <<'EOF'
#!/bin/sh
if [ "$1" = '--version' ]; then
  printf '%s\n' 'git stub 1.0'
  exit 0
fi
if [ "$1" = 'clone' ]; then
  printf '%s\n' "$@" >"$JEO_TEST_GIT_LOG"
  exit 1
fi
exit 0
EOF
chmod 700 "$ROOT_BIN/git"
run_root_installer() {
  local log="$1"
  JEO_TEST_GIT_LOG="$log" TMPDIR="$WORK/tmp" HOME="$HOME" PATH="$ROOT_BIN:$ORIGINAL_PATH" \
    INSTALL_GLOBAL=true INSTALL_MCP=false INSTALL_MODE=silent /bin/bash "$ROOT_INSTALLER" >"$LAST_OUTPUT" 2>&1
  LAST_STATUS=$?
}
run_root_installer "$WORK/git-one.log"
expect_status 1 'root installer failed clone cleanup run'
first_stage="$(dirname "$(tail -n 1 "$WORK/git-one.log")")"
[ ! -e "$first_stage" ] || fail 'root installer did not clean its failed secure staging directory'
run_root_installer "$WORK/git-two.log"
expect_status 1 'root installer second failed clone cleanup run'
second_stage="$(dirname "$(tail -n 1 "$WORK/git-two.log")")"
[ "$first_stage" != "$second_stage" ] || fail 'root installer reused a staging directory instead of creating a unique one'
case "$first_stage" in "$WORK/tmp"/jeo-skills-install.*) ;; *) fail 'root installer staging path is not under the isolated TMPDIR' ;; esac
pass 'root installer uses a guarded unique staging directory and cleans it after clone failure'

printf 'ALL %d TARGETED RUNTIME CONFIG WRITER TESTS PASSED\n' "$PASS_COUNT"
