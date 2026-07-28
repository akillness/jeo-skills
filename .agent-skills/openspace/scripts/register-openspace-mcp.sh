#!/usr/bin/env bash
# register-openspace-mcp.sh — register the OpenSpace MCP server into every AI runtime
# config that is actually present on this machine.
#
# OpenSpace is the skill-finder layer over the shared skills root, so every runtime that
# can call MCP should see it: Claude Code and its Anthropic-compatible forks (kimi, glm,
# deepseek, grok, qwen, …), Codex, Gemini CLI, Cursor, OpenCode, and the pi/gjc/jeopi
# agent runtimes.
#
# Policy:
#   - a config file that already exists is merged in place (mode + owner preserved,
#     symlinks and non-regular files refused, atomic same-dir replace)
#   - a config file that does not exist is created only when its parent runtime
#     directory exists (mode 600) — runtimes that are not installed are skipped
#   - an existing `openspace` entry is left alone unless --force is passed
#
# Env knobs:
#   SKILLS_ROOT=<dir>      host skill root advertised as OPENSPACE_HOST_SKILL_DIRS
#                          (default: $HOME/.agents/skills)
#   OPENSPACE_HOME=<dir>   OpenSpace checkout used as OPENSPACE_WORKSPACE
#                          (default: $HOME/.openspace/OpenSpace)
#   OPENSPACE_VENV=<dir>   venv Step 3l builds openspace-mcp into
#                          (default: $HOME/.agents/venvs/openspace)
#   OPENSPACE_BIN=<path>   openspace-mcp executable. Default resolution order:
#                          $OPENSPACE_VENV/bin/openspace-mcp, then ~/.local/bin, then
#                          PATH, then the legacy $OPENSPACE_HOME/../venv/bin copy.
#   OPENSPACE_CLOUD_MODE   default: local
#   OPENSPACE_CLOUD_API_KEY optional; only written when non-empty
#
# Usage: bash register-openspace-mcp.sh [--dry-run] [--force] [--help]

set -euo pipefail

_HOME="${_HOME:-${USERPROFILE:-$HOME}}"
SKILLS_ROOT="${SKILLS_ROOT:-$_HOME/.agents/skills}"
OPENSPACE_HOME="${OPENSPACE_HOME:-$_HOME/.openspace/OpenSpace}"
OPENSPACE_VENV="${OPENSPACE_VENV:-$_HOME/.agents/venvs/openspace}"
OPENSPACE_CLOUD_MODE="${OPENSPACE_CLOUD_MODE:-local}"
DRY_RUN=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --help|-h) sed -n '2,31p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

command -v python3 >/dev/null 2>&1 || { echo "❌ python3 is required" >&2; exit 1; }

# Resolve the openspace-mcp executable. Step 3l installs it into a dedicated venv
# (PEP 668 makes a bare `pip install -e` fail on Homebrew/distro Pythons) and symlinks
# it into ~/.local/bin, so prefer those over whatever PATH happens to expose.
if [ -z "${OPENSPACE_BIN:-}" ]; then
  for _cand in \
    "$OPENSPACE_VENV/bin/openspace-mcp" \
    "$_HOME/.local/bin/openspace-mcp" \
    "$(command -v openspace-mcp 2>/dev/null || true)" \
    "$(dirname "$OPENSPACE_HOME")/venv/bin/openspace-mcp"
  do
    if [ -n "$_cand" ] && [ -x "$_cand" ]; then OPENSPACE_BIN="$_cand"; break; fi
  done
fi
if [ -z "${OPENSPACE_BIN:-}" ]; then
  echo "❌ openspace-mcp not found — run setup guide Step 3l or scripts/install-openspace.sh first" >&2
  exit 1
fi
"$OPENSPACE_BIN" --help >/dev/null 2>&1 || { echo "❌ $OPENSPACE_BIN --help failed" >&2; exit 1; }

SKILLS_ROOT="$SKILLS_ROOT" OPENSPACE_HOME="$OPENSPACE_HOME" OPENSPACE_BIN="$OPENSPACE_BIN" \
OPENSPACE_CLOUD_MODE="$OPENSPACE_CLOUD_MODE" _HOME="$_HOME" DRY_RUN="$DRY_RUN" FORCE="$FORCE" \
python3 - <<'PY'
import json, os, pathlib, re, stat, tempfile

home = pathlib.Path(os.environ["_HOME"])
bin_path = os.environ["OPENSPACE_BIN"]
dry = os.environ["DRY_RUN"] == "1"
force = os.environ["FORCE"] == "1"

env = {
    "OPENSPACE_HOST_SKILL_DIRS": os.environ["SKILLS_ROOT"],
    "OPENSPACE_WORKSPACE": os.environ["OPENSPACE_HOME"],
    "OPENSPACE_CLOUD_MODE": os.environ["OPENSPACE_CLOUD_MODE"],
}
api_key = os.environ.get("OPENSPACE_CLOUD_API_KEY", "").strip()
if api_key:
    env["OPENSPACE_CLOUD_API_KEY"] = api_key

# label, path, format, create-if-missing gate (parent dir that must exist)
TARGETS = [
    ("claude-code",      home / ".claude.json",                     "json_mcpservers", home),
    ("claude-desktop",   home / ".claude/claude_desktop_config.json","json_mcpservers", home / ".claude"),
    ("codex",            home / ".codex/config.toml",               "toml_mcp",        home / ".codex"),
    ("gemini-cli",       home / ".gemini/settings.json",            "json_mcpservers", home / ".gemini"),
    ("qwen-code",        home / ".qwen/settings.json",              "json_mcpservers", home / ".qwen"),
    ("grok-cli",         home / ".grok/config.toml",                "toml_mcp",        home / ".grok"),
    ("kimi-cli",         home / ".kimi/mcp.json",                   "json_mcpservers", home / ".kimi"),
    ("glm",              home / ".glm/mcp.json",                    "json_mcpservers", home / ".glm"),
    ("zai",              home / ".zai/mcp.json",                    "json_mcpservers", home / ".zai"),
    ("deepseek",         home / ".deepseek/mcp.json",               "json_mcpservers", home / ".deepseek"),
    ("cursor",           home / ".cursor/mcp.json",                 "json_mcpservers", home / ".cursor"),
    ("opencode",         pathlib.Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "opencode/opencode.json",
                                                                    "json_opencode",
                         pathlib.Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "opencode"),
    ("pi",               home / ".pi/agent/mcp.json",               "json_mcpservers", home / ".pi/agent"),
    ("gjc",              home / ".gjc/agent/mcp.json",              "json_mcpservers", home / ".gjc/agent"),
    ("jeopi",            home / ".jeopi/agent/mcp.json",            "json_mcpservers", home / ".jeopi/agent"),
]

json_entry = {"command": bin_path, "toolTimeout": 600, "env": dict(env)}
opencode_entry = {"type": "local", "command": [bin_path], "environment": dict(env), "enabled": True}


def atomic_write(path: pathlib.Path, text: str, mode: int, validate) -> None:
    validate(text)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.tmp.", dir=path.parent)
    tmp = pathlib.Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, mode)
        validate(tmp.read_text(encoding="utf-8"))
        if path.exists() or path.is_symlink():
            now = os.lstat(path)
            if stat.S_ISLNK(now.st_mode) or not stat.S_ISREG(now.st_mode):
                raise RuntimeError("config changed type before replacement")
        os.replace(tmp, path)
    except Exception:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass
        raise


def load_existing(path: pathlib.Path):
    """Return (text, mode) or None when the target must be skipped."""
    if path.exists() or path.is_symlink():
        st = os.lstat(path)
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise RuntimeError(f"refusing non-regular config: {path}")
        return path.read_text(encoding="utf-8"), stat.S_IMODE(st.st_mode)
    return None


def handle_json(path, key, entry):
    existing = load_existing(path)
    if existing is None:
        data, mode = {}, 0o600
    else:
        text, mode = existing
        data = json.loads(text) if text.strip() else {}
        if not isinstance(data, dict):
            raise RuntimeError(f"unexpected JSON root in {path}")
    servers = data.setdefault(key, {})
    if not isinstance(servers, dict):
        raise RuntimeError(f"unexpected '{key}' shape in {path}")
    if "openspace" in servers and not force:
        return "already registered"
    servers["openspace"] = entry
    if dry:
        return "would register"
    atomic_write(path, json.dumps(data, indent=2) + "\n", mode, json.loads)
    return "registered"


def handle_toml(path):
    existing = load_existing(path)
    text, mode = existing if existing is not None else ("", 0o600)
    if re.search(r"^\s*\[mcp_servers\.openspace\]", text, re.M):
        if not force:
            return "already registered"
        text = re.sub(r"^\s*\[mcp_servers\.openspace\][^\[]*", "", text, flags=re.M)
    lines = [f'[mcp_servers.openspace]', f'command = {json.dumps(bin_path)}',
             'args = []', 'startup_timeout_sec = 60', 'tool_timeout_sec = 600',
             '', '[mcp_servers.openspace.env]']
    lines += [f"{k} = {json.dumps(v)}" for k, v in env.items()]
    block = "\n".join(lines) + "\n"
    new = (text.rstrip("\n") + "\n\n" if text.strip() else "") + block

    def validate(candidate: str) -> None:
        try:
            import tomllib
        except ModuleNotFoundError:
            return
        tomllib.loads(candidate)

    if dry:
        validate(new)
        return "would register"
    atomic_write(path, new, mode, validate)
    return "registered"


results = []
for label, path, fmt, gate in TARGETS:
    try:
        if not (path.exists() or path.is_symlink()) and not gate.is_dir():
            results.append((label, path, "skipped (runtime not installed)"))
            continue
        if fmt == "json_mcpservers":
            status = handle_json(path, "mcpServers", json_entry)
        elif fmt == "json_opencode":
            status = handle_json(path, "mcp", opencode_entry)
        else:
            status = handle_toml(path)
        results.append((label, path, status))
    except Exception as exc:  # one broken runtime must not block the rest
        results.append((label, path, f"FAILED: {exc}"))

width = max(len(r[0]) for r in results)
failed = 0
for label, path, status in results:
    icon = "✅"
    if status.startswith("FAILED"):
        icon, failed = "❌", failed + 1
    elif status.startswith("skipped"):
        icon = "ℹ️ "
    elif status == "already registered":
        icon = "•"
    print(f"{icon} {label.ljust(width)}  {status}  ({path})")

print(f"\nopenspace-mcp: {bin_path}")
print(f"OPENSPACE_HOST_SKILL_DIRS: {env['OPENSPACE_HOST_SKILL_DIRS']}")
raise SystemExit(1 if failed else 0)
PY
