#!/usr/bin/env bash
# Merge the Headroom/Graphify/Ponytail source-mutation policy into Claude Code.
set -euo pipefail

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi
if [ "$#" -ne 0 ]; then
  printf 'Usage: %s [--dry-run]\n' "$0" >&2
  exit 2
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
HOOK="$SCRIPT_DIR/jeo-code-policy-hook.py"
SETTINGS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"

[ -f "$HOOK" ] || {
  printf 'Missing policy hook: %s\n' "$HOOK" >&2
  exit 1
}
[ -L "$SETTINGS_FILE" ] && {
  printf 'Refusing to modify symlinked Claude settings: %s\n' "$SETTINGS_FILE" >&2
  exit 1
}
[ -e "$SETTINGS_FILE" ] && [ ! -f "$SETTINGS_FILE" ] && {
  printf 'Refusing to modify non-regular Claude settings: %s\n' "$SETTINGS_FILE" >&2
  exit 1
}

if [ "$DRY_RUN" = true ]; then
  printf 'Would merge Headroom code policy hook into %s\n' "$SETTINGS_FILE"
  printf 'Hook command: python3 %q\n' "$HOOK"
  exit 0
fi

mkdir -p "$SETTINGS_DIR"
python3 - "$SETTINGS_FILE" "$HOOK" <<'PY'
import json
import os
import shlex
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

settings_path = Path(sys.argv[1])
hook_path = sys.argv[2]
command = f"python3 {shlex.quote(hook_path)}"
entry = {
    "matcher": "Edit|Write",
    "hooks": [{"type": "command", "command": command}],
}

settings_mode = 0o600
if settings_path.exists():
    if settings_path.is_symlink() or not settings_path.is_file():
        raise SystemExit(f"Refusing to modify non-regular settings: {settings_path}")
    settings_mode = settings_path.stat().st_mode & 0o777
    try:
        current = json.loads(settings_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"Claude settings are not valid JSON: {error}") from error
    if not isinstance(current, dict):
        raise SystemExit("Claude settings root must be a JSON object")
else:
    current = {}
hooks = current.setdefault("hooks", {})
if not isinstance(hooks, dict):
    raise SystemExit("Claude settings 'hooks' must be a JSON object")
pre_tool = hooks.setdefault("PreToolUse", [])
if not isinstance(pre_tool, list):
    raise SystemExit("Claude settings 'hooks.PreToolUse' must be a JSON array")

already_present = any(
    isinstance(item, dict)
    and item.get("matcher") == entry["matcher"]
    and isinstance(item.get("hooks"), list)
    and any(
        isinstance(hook, dict)
        and hook.get("type") == "command"
        and hook.get("command") == command
        for hook in item["hooks"]
    )
    for item in pre_tool
)
if already_present:
    print(f"Headroom code policy already configured in {settings_path}")
    raise SystemExit(0)

if settings_path.exists():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = settings_path.with_name(f"{settings_path.name}.headroom-policy-backup-{stamp}")
    shutil.copy2(settings_path, backup)
    print(f"Backup saved: {backup}")

pre_tool.append(entry)
descriptor, temporary_name = tempfile.mkstemp(
    prefix=f"{settings_path.name}.tmp-",
    dir=settings_path.parent,
    text=True,
)
temporary = Path(temporary_name)
try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(current, indent=2) + "\n")
    os.chmod(temporary, settings_mode)
    os.replace(temporary, settings_path)
except BaseException:
    temporary.unlink(missing_ok=True)
    raise
print(f"Headroom code policy configured in {settings_path}")
PY
