#!/usr/bin/env bash
# Focused isolated regression coverage for runtime configuration writers.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTATION="$ROOT/.agent-skills/agentation/scripts/setup-agentation-mcp.sh"
OBS_INSTALL="$ROOT/.agent-skills/obsidian-second-brain/scripts/install.sh"
PLAN_HOOK="$ROOT/.agent-skills/plannotator/scripts/setup-hook.sh"
PLAN_GEMINI="$ROOT/.agent-skills/plannotator/scripts/setup-gemini-hook.sh"
PLAN_OPENCODE="$ROOT/.agent-skills/plannotator/scripts/setup-opencode-plugin.sh"
CODEX_OMC_POSTTOOL_REPAIR="$ROOT/.agent-skills/jeo-skill/scripts/repair-codex-omc-posttool-hooks.sh"
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
require_file "$PLAN_HOOK"
require_file "$CODEX_OMC_POSTTOOL_REPAIR"
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

# The Codex OMC repair removes only the incompatible response field from all known cache hooks.
# Its production SHA-256 allow-list pins canonical OMC sources, so this isolated fixture derives
# an equivalent allow-list in a temporary helper from the exact post-repair fixture bytes.
CODEX_OMC_REPAIR_HOME="$WORK/codex-omc-posttool-home"
CODEX_OMC_REPAIR_CACHE="$CODEX_OMC_REPAIR_HOME/.codex/plugins/cache/omc/oh-my-claudecode/4.15.7/scripts"
CODEX_OMC_REPAIR_EXPECTED="$WORK/codex-omc-posttool-expected"
CODEX_OMC_POSTTOOL_REPAIR_TEST="$WORK/repair-codex-omc-posttool-hooks.sh"
cp "$CODEX_OMC_POSTTOOL_REPAIR" "$WORK/repair-codex-omc-posttool-hooks.sh.before"
mkdir -p "$CODEX_OMC_REPAIR_CACHE" "$CODEX_OMC_REPAIR_EXPECTED"
printf '%s\n' 'model = "keep"' >"$CODEX_OMC_REPAIR_HOME/.codex/config.toml"
cp "$CODEX_OMC_REPAIR_HOME/.codex/config.toml" "$WORK/codex-omc-config-before.toml"

cat >"$CODEX_OMC_REPAIR_CACHE/post-tool-verifier.mjs" <<'EOF'
export function generateMessage(message) {
  const response = { continue: true };
  response.hookSpecificOutput = {
    hookEventName: 'PostToolUse',
    additionalContext: 'Verify the tool result before continuing.',
  };
  const preserved = { hook: 'verifier' };
  if (message) {
    response.hookSpecificOutput.additionalContext = message;
  } else {
    response.suppressOutput = true;
  }
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  return { ...response, preserved };
}
EOF
cat >"$CODEX_OMC_REPAIR_CACHE/project-memory-posttool.mjs" <<'EOF'
export function learnFromToolOutput() {
  const preserved = { hook: 'memory' };
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  return preserved;
}
EOF
cat >"$CODEX_OMC_REPAIR_CACHE/post-tool-rules-injector.mjs" <<'EOF'
export function createRulesInjectorHook() {
  const preserved = { hook: 'rules' };
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  return preserved;
}
EOF

cat >"$CODEX_OMC_REPAIR_EXPECTED/post-tool-verifier.mjs" <<'EOF'
export function generateMessage(message) {
  const response = { continue: true };
  response.hookSpecificOutput = {
    hookEventName: 'PostToolUse',
    additionalContext: 'Verify the tool result before continuing.',
  };
  const preserved = { hook: 'verifier' };
  if (message) {
    response.hookSpecificOutput.additionalContext = message;
  }
  console.log(JSON.stringify({ continue: true }));
  return { ...response, preserved };
}
EOF
cat >"$CODEX_OMC_REPAIR_EXPECTED/project-memory-posttool.mjs" <<'EOF'
export function learnFromToolOutput() {
  const preserved = { hook: 'memory' };
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  return preserved;
}
EOF
cat >"$CODEX_OMC_REPAIR_EXPECTED/post-tool-rules-injector.mjs" <<'EOF'
export function createRulesInjectorHook() {
  const preserved = { hook: 'rules' };
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  console.log(JSON.stringify({ continue: true }));
  return preserved;
}
EOF

python3 - "$CODEX_OMC_POSTTOOL_REPAIR" "$CODEX_OMC_POSTTOOL_REPAIR_TEST" "$CODEX_OMC_REPAIR_EXPECTED" <<'PY' \
  || fail 'could not create the isolated digest-pinned Codex OMC repair helper'
from pathlib import Path
import hashlib
import re
import shutil
import sys

source_helper, temporary_helper, expected_directory = map(Path, sys.argv[1:])
expected = {
    path.name: hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted(expected_directory.glob("*.mjs"))
}
if set(expected) != {
    "post-tool-verifier.mjs",
    "project-memory-posttool.mjs",
    "post-tool-rules-injector.mjs",
}:
    raise SystemExit("unexpected post-repair fixture set")

shutil.copyfile(source_helper, temporary_helper)
source = temporary_helper.read_text(encoding="utf-8")
replacement = "COMPATIBLE_DIGESTS = {\n" + "".join(
    f'    "{name}": "{digest}",\n' for name, digest in expected.items()
) + "}"
updated, replacements = re.subn(
    r'COMPATIBLE_DIGESTS = \{\n(?:    "[^"]+": "[0-9a-f]{64}",\n)+\}',
    replacement,
    source,
    count=1,
)
if replacements != 1:
    raise SystemExit("could not locate the helper digest allow-list")
temporary_helper.write_text(updated, encoding="utf-8")
PY

run_capture env HOME="$CODEX_OMC_REPAIR_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse cache repair'
cmp -s "$WORK/codex-omc-config-before.toml" "$CODEX_OMC_REPAIR_HOME/.codex/config.toml" \
  || fail 'Codex OMC PostToolUse repair changed Codex configuration'
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cmp -s "$CODEX_OMC_REPAIR_EXPECTED/$target" "$CODEX_OMC_REPAIR_CACHE/$target" \
    || fail "Codex OMC PostToolUse repair did not produce the expected $target bytes"
done
pass 'Codex OMC PostToolUse repair transforms each compatible fixture without changing unrelated content'

for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cp "$CODEX_OMC_REPAIR_CACHE/$target" "$WORK/codex-omc-repaired-$target"
done
run_capture env HOME="$CODEX_OMC_REPAIR_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse idempotent rerun'
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cmp -s "$WORK/codex-omc-repaired-$target" "$CODEX_OMC_REPAIR_CACHE/$target" \
    || fail "Codex OMC PostToolUse idempotent rerun changed $target"
done
pass 'Codex OMC PostToolUse repair rerun is byte-for-byte idempotent'

# A memory-style decoy can retain the expected hook marker and every quiet response while
# still being untrusted when its final bytes are not the allow-listed canonical source.
CODEX_OMC_DECOY_HOME="$WORK/codex-omc-posttool-decoy-home"
CODEX_OMC_DECOY_CACHE="$CODEX_OMC_DECOY_HOME/.codex/plugins/cache/omc/oh-my-claudecode/4.15.7/scripts"
mkdir -p "$CODEX_OMC_DECOY_CACHE"
for target in post-tool-verifier.mjs post-tool-rules-injector.mjs; do
  cp "$CODEX_OMC_REPAIR_EXPECTED/$target" "$CODEX_OMC_DECOY_CACHE/$target"
done
cat >"$CODEX_OMC_DECOY_CACHE/project-memory-posttool.mjs" <<'EOF'
export function learnFromToolOutput() {
  const unrelated = { source: 'decoy-memory-hook' };
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  return unrelated;
}
EOF
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cp "$CODEX_OMC_DECOY_CACHE/$target" "$WORK/codex-omc-decoy-$target.before"
done
run_capture env HOME="$CODEX_OMC_DECOY_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse digest-decoy skip'
expect_output 'repair skipped: unrecognized project-memory-posttool.mjs' 'Codex OMC PostToolUse digest-decoy skip'
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cmp -s "$WORK/codex-omc-decoy-$target.before" "$CODEX_OMC_DECOY_CACHE/$target" \
    || fail "Codex OMC PostToolUse repair changed digest-decoy target $target"
done
pass 'Codex OMC PostToolUse exact-digest gate skips a marker-and-count-matching memory decoy'

# The helper must not follow a leaf target symlink.
CODEX_OMC_LEAF_HOME="$WORK/codex-omc-posttool-leaf-home"
CODEX_OMC_LEAF_CACHE="$CODEX_OMC_LEAF_HOME/.codex/plugins/cache/omc/oh-my-claudecode/4.15.7/scripts"
CODEX_OMC_LEAF_TARGET="$WORK/codex-omc-posttool-leaf-target.mjs"
mkdir -p "$CODEX_OMC_LEAF_CACHE"
printf '%s\n' 'const outside = { suppressOutput: true };' >"$CODEX_OMC_LEAF_TARGET"
cp "$CODEX_OMC_LEAF_TARGET" "$WORK/codex-omc-posttool-leaf-target.before"
ln -s "$CODEX_OMC_LEAF_TARGET" "$CODEX_OMC_LEAF_CACHE/post-tool-verifier.mjs"
run_capture env HOME="$CODEX_OMC_LEAF_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse leaf-symlink skip'
expect_output 'repair skipped: unsafe target post-tool-verifier.mjs' 'Codex OMC PostToolUse leaf-symlink skip'
cmp -s "$WORK/codex-omc-posttool-leaf-target.before" "$CODEX_OMC_LEAF_TARGET" \
  || fail 'Codex OMC PostToolUse repair changed a leaf-symlink target'
pass 'Codex OMC PostToolUse repair skips a leaf symlink without target mutation'

# The helper must also reject a symlinked cache scripts directory before reading external targets.
CODEX_OMC_SCRIPTS_LINK_HOME="$WORK/codex-omc-posttool-scripts-link-home"
CODEX_OMC_SCRIPTS_PARENT="$CODEX_OMC_SCRIPTS_LINK_HOME/.codex/plugins/cache/omc/oh-my-claudecode/4.15.7"
CODEX_OMC_SCRIPTS_TARGET="$WORK/codex-omc-posttool-external-scripts"
mkdir -p "$CODEX_OMC_SCRIPTS_PARENT" "$CODEX_OMC_SCRIPTS_TARGET"
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  printf '%s\n' "const external${target%%.*} = { suppressOutput: true };" >"$CODEX_OMC_SCRIPTS_TARGET/$target"
  cp "$CODEX_OMC_SCRIPTS_TARGET/$target" "$WORK/codex-omc-external-$target.before"
done
ln -s "$CODEX_OMC_SCRIPTS_TARGET" "$CODEX_OMC_SCRIPTS_PARENT/scripts"
run_capture env HOME="$CODEX_OMC_SCRIPTS_LINK_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse scripts-directory symlink skip'
expect_output 'repair skipped: unsafe cache directory scripts' 'Codex OMC PostToolUse scripts-directory symlink skip'
for target in post-tool-verifier.mjs project-memory-posttool.mjs post-tool-rules-injector.mjs; do
  cmp -s "$WORK/codex-omc-external-$target.before" "$CODEX_OMC_SCRIPTS_TARGET/$target" \
    || fail "Codex OMC PostToolUse repair changed an external scripts target $target"
done
pass 'Codex OMC PostToolUse repair skips a symlinked scripts directory without external mutation'

CODEX_OMC_NOOP_HOME="$WORK/codex-omc-posttool-noop-home"
mkdir -p "$CODEX_OMC_NOOP_HOME"
run_capture env HOME="$CODEX_OMC_NOOP_HOME" PATH="$PATH" /bin/bash "$CODEX_OMC_POSTTOOL_REPAIR_TEST"
expect_status 0 'Codex OMC PostToolUse cache-absent no-op'
[ ! -e "$CODEX_OMC_NOOP_HOME/.codex" ] \
  || fail 'Codex OMC PostToolUse cache-absent no-op created ~/.codex'
pass 'Codex OMC PostToolUse repair preserves hook output, leaves config unchanged, and safely no-ops without a cache'

cmp -s "$WORK/repair-codex-omc-posttool-hooks.sh.before" "$CODEX_OMC_POSTTOOL_REPAIR" \
  || fail 'Codex OMC PostToolUse test mutated the repository repair helper'
pass 'Codex OMC PostToolUse fixtures leave the repository helper byte-for-byte unchanged'


# Every changed shell writer must remain parseable.
for writer in \
  "$ROOT_INSTALLER" \
  "$AGENTATION" \
  "$ROOT/.agent-skills/obsidian-second-brain/scripts/install.sh" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-hook.sh" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-gemini-hook.sh" \
  "$CODEX_OMC_POSTTOOL_REPAIR" \
  "$ROOT/.agent-skills/plannotator/scripts/setup-opencode-plugin.sh"; do
  /bin/bash -n "$writer" || fail "shell syntax invalid: $writer"
done
pass 'all changed runtime shell writers pass bash syntax validation'

# Extract every current bash/sh fence from the setup guide and syntax-check it.
GUIDE_DIR="$WORK/guide-shell"
mkdir -p "$GUIDE_DIR"
python3 - "$GUIDE" "$GUIDE_DIR" <<'PY' || fail 'could not extract shell fences from setup guide'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
destination = Path(sys.argv[2])
in_block = False
blocks = []
current = []
for line in source.splitlines(keepends=True):
    marker = line.strip()
    if not in_block and marker in {"```bash", "```sh"}:
        in_block = True
        current = []
    elif in_block and marker == "```":
        blocks.append("".join(current))
        in_block = False
    elif in_block:
        current.append(line)
if in_block:
    raise SystemExit("unterminated shell fence")
if not blocks:
    raise SystemExit("no bash/sh fences found")
for index, block in enumerate(blocks, 1):
    (destination / f"{index:02d}.sh").write_text(block)
PY
for snippet in "$GUIDE_DIR"/*.sh; do
  /bin/bash -n "$snippet" || fail "setup-guide shell fence is invalid: $snippet"
done
pass 'all current setup-guide shell fences are syntactically valid'



printf 'ALL %d TARGETED RUNTIME CONFIG WRITER TESTS PASSED\n' "$PASS_COUNT"
