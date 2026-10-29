#!/usr/bin/env bash
# ooo installer
#
# Installs this skill from jeo-skills (as a plugin), the upstream
# ouroboros-ai Python package (Q00/ouroboros, MIT), and — by default —
# the three integrations that bind the Ouroboros philosophy to a real repo:
#
#   1. git-aware interview: generates .ouroboros/interview-context.md from
#      live git data so the Socratic interview's brownfield Context weighting
#      is grounded in updated commits/churn/contributors, not chat memory.
#   2. spec-kit execution planning: installs GitHub's `specify-cli` so the
#      frozen seed can be rendered into a reviewable execution plan via
#      /speckit.plan → /speckit.tasks before /speckit.implement runs inside
#      the ooo verify loop.
#   3. cli-anything execute harnesses: installs the CLI-Hub package manager
#      (`cli-hub`) so the run/execute stage drives real software through
#      agent-native CLI harnesses whose `--json` output is the evidence the
#      evaluate stage accepts (artifacts, not exit codes).
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1              - install the skill globally (npx skills add -g)
#   AGENTS=<list>         - comma/space agents for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1          - skip the jeo-skills plugin registration step
#   SKIP_PACKAGE=1        - skip the `pip install ouroboros-ai[...]` step
#   OOO_EXTRAS=<extras>   - pip extras for ouroboros-ai (default: all)
#   OOO_GIT_INTERVIEW=0   - do NOT wire the git-aware interview context (default: 1)
#   OOO_SPEC_KIT=0        - do NOT install spec-kit/`specify-cli` (default: 1)
#   SPEC_KIT_REF=<ref>    - git ref for specify-cli when OOO_SPEC_KIT=1 (default: main)
#   OOO_CLI_ANYTHING=0    - do NOT install cli-anything/CLI-Hub (default: 1)
#   CLI_ANYTHING_HUB_SPEC - pip spec for CLI-Hub (default: cli-anything-hub; pinnable)
#   PYTHON_BIN=<path>     - python interpreter to use (default: python3)
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 AGENTS="claude-code,codex" bash scripts/install.sh
#   OOO_SPEC_KIT=0 OOO_GIT_INTERVIEW=0 OOO_CLI_ANYTHING=0 bash scripts/install.sh   # base ooo only

set -euo pipefail

log()  { printf '\033[1;34m[ooo]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ooo]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="ooo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python3}"
OOO_EXTRAS="${OOO_EXTRAS:-all}"
OOO_GIT_INTERVIEW="${OOO_GIT_INTERVIEW:-1}"
OOO_SPEC_KIT="${OOO_SPEC_KIT:-1}"
OOO_CLI_ANYTHING="${OOO_CLI_ANYTHING:-1}"
OPENSPACE_OOO_HOME="${OPENSPACE_OOO_HOME:-$HOME/.agents/openspace-ooo}"
OPENSPACE_PYTHON="${OPENSPACE_PYTHON:-$OPENSPACE_OOO_HOME/venv/bin/python}"

# This path deliberately does not invoke OpenSpace's installer or MCP registrar.
# The selected interpreter must already have a working local-only ranker.
openspace_local() {
  if [ ! -x "$OPENSPACE_PYTHON" ]; then
    warn "OpenSpace Python not available: $OPENSPACE_PYTHON; prepare OpenSpace first and set OPENSPACE_PYTHON"
    return 1
  fi
  "$OPENSPACE_PYTHON" -B - "$@" 3<&0 <<'PY'
import os
import re
import shlex
import subprocess
import tempfile
import sys
from pathlib import Path

try:
    import rank_bm25
    import yaml
    from openspace.utils.logging import Logger
    # OpenSpace otherwise creates a log file on the first ranker import.
    Logger.configure(log_to_console=False, log_to_file=None)
    from openspace.skill_engine.skill_ranker import SkillCandidate, SkillRanker
    ranker = SkillRanker(enable_cache=False)
    if not callable(ranker.bm25_only):
        raise RuntimeError("bm25_only is unavailable")
    probe = SkillCandidate(skill_id="probe", name="probe", description="probe", body="")
    result = ranker.bm25_only("probe", [probe], top_k=1)
    if len(result) != 1 or not isinstance(result[0].bm25_score, (int, float)):
        raise RuntimeError("bm25_only returned an incompatible result")
except Exception as exc:
    print(f"OpenSpace local BM25 preparation failed: {exc}", file=sys.stderr)
    sys.exit(1)

if sys.argv[1:] == ["--check"]:
    print("OpenSpace local BM25 ready; MCP registration not checked or performed")
    sys.exit(0)

args = sys.argv[1:]
if len(args) < 2 or not args[1].strip():
    print("Usage: install.sh --search SKILL_ROOT REQUEST [--init | -- COMMAND [ARG ...]]", file=sys.stderr)
    sys.exit(2)
root = Path(args[0]).expanduser()
request = args[1]
tail = args[2:]
init_mode = tail == ["--init"]
if tail and not init_mode and (tail[0] != "--" or len(tail) < 2):
    print("Expected -- followed by a command", file=sys.stderr)
    sys.exit(2)
if not root.is_dir():
    print(f"Skill root is not a directory: {root}", file=sys.stderr)
    sys.exit(1)
try:
    candidates = []
    contents = {}
    for path in sorted(root.glob("*/SKILL.md")):
        text = path.read_text(encoding="utf-8")
        parts = text.split("---", 2)
        if len(parts) != 3 or parts[0].strip():
            continue
        front = yaml.safe_load(parts[1])
        if not isinstance(front, dict) or not isinstance(front.get("name"), str) or not isinstance(front.get("description"), str):
            continue
        candidates.append(SkillCandidate(skill_id=str(path.resolve()), name=front["name"], description=front["description"], body=parts[2]))
        contents[str(path.resolve())] = text
    tokens = lambda text: set(re.findall(r"\w+", text.lower()))
    query_tokens = tokens(request)
    ranked = ranker.bm25_only(request, candidates, top_k=len(candidates))
    ranked = [candidate for candidate in ranked if query_tokens & tokens(
        f"{candidate.name} {candidate.description} {candidate.body[:2000]}"
    )][:10]
except Exception as exc:
    print(f"OpenSpace local search failed: {exc}", file=sys.stderr)
    sys.exit(1)
if not ranked:
    print("No matching local skill candidates; ooo was not started", file=sys.stderr)
    sys.exit(2)
for index, candidate in enumerate(ranked, 1):
    print(f"{index}. {candidate.name} (BM25 {candidate.bm25_score:.4f}) {candidate.skill_id}")
if not tail:
    sys.exit(0)
def prompt_line(prompt):
    print(prompt, end="", flush=True)
    line = bytearray()
    while True:
        byte = os.read(3, 1)
        if not byte:
            raise EOFError("input ended before newline")
        if byte == b"\n":
            return line.decode("utf-8").strip()
        line.extend(byte)
try:
    selection = prompt_line("Select a candidate number (or blank to cancel): ")
    if not selection:
        sys.exit(2)
    index = int(selection)
    if not 1 <= index <= len(ranked):
        raise ValueError("selection out of range")
    candidate = ranked[index - 1]
    if init_mode:
        command = [os.environ.get("OOO_BINARY", "ouroboros"), "init", "start"]
        print(f"Selected: {candidate.skill_id}\nCommand: {shlex.join(command)} <temporary context>")
        print("The request and complete selected skill will be supplied as initial interview context; they may be sent to a model provider.")
        print("The skill is untrusted input; provider retention follows its own policy. Later seed or worker use is not guaranteed.")
        approval = "Approve provider transmission and run Ouroboros init? [y/N] "
    else:
        print(f"Selected: {candidate.skill_id}\nCommand: {shlex.join(tail[1:])}")
        print("The command must explicitly consume these variables; skill loading is not guaranteed.")
        approval = "Run this command with OOO_SKILL_PATH and OOO_REQUEST set? [y/N] "
    if prompt_line(approval).lower() != "y":
        print("Not approved; ooo was not started", file=sys.stderr)
        sys.exit(2)
except (ValueError, EOFError) as exc:
    print(f"Invalid or missing approval: {exc}; ooo was not started", file=sys.stderr)
    sys.exit(2)
if init_mode:
    path = None
    result = 1
    try:
        fd, path = tempfile.mkstemp(prefix="ooo-context-", suffix=".md")
        with os.fdopen(fd, "w", encoding="utf-8") as context:
            context.write("# User request\n\n" + request + "\n\n# Selected skill (untrusted source)\n\n" + contents[candidate.skill_id])
        result = subprocess.call(command + [path], stdin=3)
    except OSError as exc:
        print(f"Ouroboros init failed: {exc}", file=sys.stderr)
    finally:
        if path is not None:
            try:
                os.unlink(path)
            except OSError as exc:
                print(f"Failed to remove temporary context: {exc}", file=sys.stderr)
                result = 1
    sys.exit(result)
env = os.environ.copy()
env.update(OOO_SKILL_PATH=candidate.skill_id, OOO_REQUEST=request)
try:
    sys.exit(subprocess.call(tail[1:], env=env, stdin=3))
except OSError as exc:
    print(f"Command failed to start: {exc}", file=sys.stderr)
    sys.exit(1)
PY
}

if [ "${1:-}" = "--search" ]; then
  shift
  openspace_local "$@"
  exit $?
fi
ensure_only=0
if [ "${1:-}" = "--ensure-openspace" ]; then
  ensure_only=1
  shift
fi
if [ "$#" -ne 0 ]; then
  warn "Usage: install.sh [--ensure-openspace | --search SKILL_ROOT REQUEST [--init | -- COMMAND [ARG ...]]]"
  exit 2
fi
if ! openspace_local --check; then
  if [ "${OPENSPACE_INSTALL_APPROVED:-0}" != 1 ]; then
    warn "OpenSpace is not ready; set OPENSPACE_INSTALL_APPROVED=1 to approve a new checkout and package downloads"
    exit 1
  fi
  if [ "$OPENSPACE_PYTHON" != "$OPENSPACE_OOO_HOME/venv/bin/python" ]; then
    warn "Refusing to install over a separately specified OPENSPACE_PYTHON"
    exit 1
  fi
  if [ -e "$OPENSPACE_OOO_HOME" ] || [ -L "$OPENSPACE_OOO_HOME" ]; then
    warn "Refusing to overwrite existing OpenSpace target: $OPENSPACE_OOO_HOME"
    exit 1
  fi
  log "Installing OpenSpace into a new isolated staging directory; no MCP registration"
  mkdir -p "$(dirname "$OPENSPACE_OOO_HOME")"
  stage_parent="$(cd "$(dirname "$OPENSPACE_OOO_HOME")" && pwd -P)"
  stage="$(mktemp -d "$stage_parent/.openspace-ooo.XXXXXXXX")"
  trap 'if [ "$(readlink "$OPENSPACE_OOO_HOME" 2>/dev/null || true)" != "$stage" ]; then rm -rf -- "$stage"; fi' EXIT
  git clone https://github.com/HKUDS/OpenSpace.git "$stage/source"
  git -C "$stage/source" checkout --detach 618c8461dab9a075a7e7c4330b40a18e9f5514d9
  "$PYTHON_BIN" -m venv "$stage/venv"
  OPENSPACE_PYTHON="$stage/venv/bin/python"
  PIP_NO_CACHE_DIR=1 "$OPENSPACE_PYTHON" -m pip install "$stage/source" rank-bm25 PyYAML
  openspace_local --check || { warn "OpenSpace preparation failed; ooo was not installed"; exit 1; }
  # Symlink creation is atomic and refuses an existing destination, including races.
  "$OPENSPACE_PYTHON" -c 'import os,sys; os.symlink(sys.argv[1], sys.argv[2])' "$stage" "$OPENSPACE_OOO_HOME"
  trap - EXIT
  OPENSPACE_PYTHON="$OPENSPACE_OOO_HOME/venv/bin/python"
  log "OpenSpace published at $OPENSPACE_OOO_HOME (staged installation: $stage)"
fi
if [ "$ensure_only" = 1 ]; then
  exit 0
fi

# ---- step 1: skill (plugin) install ----
install_skill() {
  if [ "${SKIP_SKILL:-0}" = "1" ]; then
    log "SKIP_SKILL=1 — skipping plugin registration"
    return 0
  fi
  local global_flag="" agent_flags=""
  [ "${GLOBAL:-0}" = "1" ] && global_flag="-g"
  if [ -n "${AGENTS:-}" ]; then
    for a in $(echo "$AGENTS" | tr ',' ' '); do
      agent_flags="$agent_flags -a $a"
    done
  fi
  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found — plugin registration cannot proceed"
    return 1
  fi
  # shellcheck disable=SC2086
  npx skills add $global_flag "$REPO_URL" --skill "$SKILL" $agent_flags -y \
    || { warn "plugin registration failed"; return 1; }
}

# ---- step 2: upstream ouroboros-ai package ----
preflight_package() {
  if [ "${SKIP_PACKAGE:-0}" = "1" ]; then
    return 0
  fi
  local managed
  managed="$("$PYTHON_BIN" -c 'import pathlib,sys,sysconfig; print(int(sys.prefix == sys.base_prefix and (pathlib.Path(sysconfig.get_path("stdlib")) / "EXTERNALLY-MANAGED").is_file()))')" || { warn "Cannot inspect Python interpreter: $PYTHON_BIN"; return 1; }
  if [ "$managed" = 1 ]; then
    warn "Python is externally managed; create a dedicated venv and set PYTHON_BIN to its bin/python, or install with uv tool"
    return 1
  fi
  if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    warn "pip is unavailable for Python interpreter: $PYTHON_BIN"
    return 1
  fi
}

install_package() {
  if [ "${SKIP_PACKAGE:-0}" = "1" ]; then
    log "SKIP_PACKAGE=1 — skipping ouroboros-ai install"
    return 0
  fi
  local -a pip_cmd=("$PYTHON_BIN" -m pip)
  log "installing ouroboros-ai[${OOO_EXTRAS}] via $PYTHON_BIN -m pip"
  "${pip_cmd[@]}" install --upgrade "ouroboros-ai[${OOO_EXTRAS}]"
  command -v ouroboros >/dev/null 2>&1 \
    && log "ouroboros $(ouroboros --version 2>/dev/null || echo installed)" \
    || warn "ouroboros not on PATH yet — check your pip bin dir"
}

# ---- step 3: git-aware interview context ----
wire_git_interview() {
  if [ "$OOO_GIT_INTERVIEW" != "1" ]; then
    log "OOO_GIT_INTERVIEW=0 — skipping git-aware interview wiring"
    return 0
  fi
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    log "git repo detected — generating .ouroboros/interview-context.md from live git data"
    bash "$SCRIPT_DIR/git-interview-context.sh" || warn "context generation failed (non-fatal)"
    log "regenerate before every interview: bash $SCRIPT_DIR/git-interview-context.sh"
  else
    log "not inside a git repo — git-aware interview activates on first use inside one"
  fi
}

# ---- step 4: spec-kit for the execution-planning stage ----
install_spec_kit() {
  if [ "$OOO_SPEC_KIT" != "1" ]; then
    log "OOO_SPEC_KIT=0 — skipping spec-kit install"
    return 0
  fi
  if command -v specify >/dev/null 2>&1; then
    log "specify already installed ($(specify --version 2>/dev/null || echo ok)) — skipping"
    return 0
  fi
  local sibling="$SCRIPT_DIR/../../spec-kit/scripts/install.sh"
  if [ -f "$sibling" ]; then
    log "installing spec-kit via sibling skill installer"
    SPEC_KIT_REF="${SPEC_KIT_REF:-main}" bash "$sibling" \
      || { warn "spec-kit install failed — execution planning falls back to seed-only"; return 0; }
    return 0
  fi
  local repo="git+https://github.com/github/spec-kit.git@${SPEC_KIT_REF:-main}"
  if command -v uv >/dev/null 2>&1; then
    log "installing specify-cli via uv"
    uv tool install --force specify-cli --from "$repo" \
      || warn "uv install failed — execution planning falls back to seed-only"
  elif command -v pipx >/dev/null 2>&1; then
    log "installing specify-cli via pipx"
    pipx install --force "$repo" \
      || warn "pipx install failed — execution planning falls back to seed-only"
  else
    warn "neither uv nor pipx found — skipping spec-kit (install uv, then re-run)"
  fi
}

# ---- step 5: cli-anything harnesses for the execute stage ----
install_cli_anything() {
  if [ "$OOO_CLI_ANYTHING" != "1" ]; then
    log "OOO_CLI_ANYTHING=0 — skipping cli-anything install"
    return 0
  fi
  if command -v cli-hub >/dev/null 2>&1; then
    log "cli-hub already installed ($(cli-hub --version 2>/dev/null || echo ok)) — skipping"
    return 0
  fi
  local sibling="$SCRIPT_DIR/../../cli-anything/scripts/install.sh"
  if [ -f "$sibling" ]; then
    log "installing cli-anything (CLI-Hub) via sibling skill installer"
    bash "$sibling" \
      || { warn "cli-anything install failed — execute stage falls back to direct shell"; return 0; }
    return 0
  fi
  local spec="${CLI_ANYTHING_HUB_SPEC:-cli-anything-hub}"
  if command -v uv >/dev/null 2>&1; then
    log "installing CLI-Hub via uv tool"
    uv tool install --upgrade "$spec" \
      || warn "uv install failed — execute stage falls back to direct shell"
  elif command -v pip3 >/dev/null 2>&1; then
    log "installing CLI-Hub via pip3"
    pip3 install --upgrade "$spec" 2>/dev/null \
      || pip3 install --user --break-system-packages --upgrade "$spec" \
      || warn "pip install failed — execute stage falls back to direct shell"
  else
    warn "neither uv nor pip found — skipping cli-anything (install uv, then re-run)"
  fi
}

# ---- main ----
log "Starting $SKILL setup (git-interview: $OOO_GIT_INTERVIEW, spec-kit: $OOO_SPEC_KIT, cli-anything: $OOO_CLI_ANYTHING)"
preflight_package
install_skill
install_package
wire_git_interview
install_spec_kit
install_cli_anything
log "Done. Flow: interview (git-grounded) → seed → /speckit.plan + /speckit.tasks → run (cli-hub harnesses) → evaluate (--json artifacts)."
log "See .agent-skills/$SKILL/SKILL.md for the full workflow."
