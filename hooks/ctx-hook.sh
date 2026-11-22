#!/bin/sh
# jeo-skills-managed: ctx-hook
# Portable lifecycle hook runner for ctx refresh and second-brain PostCompact.
set -u

ACTION="${1:-refresh}"
HOST="${2:-}"
HOOKS_DIR="${HOME}/.agents/hooks"
CTX_SHIM="${HOME}/.local/bin/ctx"

run_ctx_refresh() {
  if [ -x "$CTX_SHIM" ]; then
    "$CTX_SHIM" refresh --scope all >/dev/null 2>&1 || true
  elif [ -d "${HOOKS_DIR}/ctx" ] && command -v python3 >/dev/null 2>&1; then
    PYTHONPATH="${HOOKS_DIR}${PYTHONPATH:+:$PYTHONPATH}" python3 -m ctx refresh --scope all >/dev/null 2>&1 || true
  fi
}

run_second_brain_compact() {
  if [ -f "${HOOKS_DIR}/context_config.py" ] && command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, subprocess, sys
from pathlib import Path
hooks_dir = Path.home() / ".agents" / "hooks"
sys.path.insert(0, str(hooks_dir))
from context_config import resolve_second_brain_vault
vault = resolve_second_brain_vault()
if not vault:
    raise SystemExit(0)
runtime_py = vault / ".second-brain" / "scripts" / "runtime.py"
cfg_json = vault / ".second-brain" / "config.json"
if not (runtime_py.is_file() and cfg_json.is_file()):
    raise SystemExit(0)
py_bin = sys.executable
try:
    cfg = json.loads(cfg_json.read_text(encoding="utf-8"))
    if isinstance(cfg, dict) and isinstance(cfg.get("python_bin"), str) and cfg["python_bin"].strip():
        candidate = Path(cfg["python_bin"].strip()).expanduser()
        if candidate.exists():
            py_bin = str(candidate)
except Exception:
    pass
payload = sys.stdin.read()
subprocess.run(
    [py_bin, str(runtime_py), "--config", str(cfg_json), "--event", "postcompact"],
    input=payload, text=True, capture_output=True, timeout=30,
)
' >/dev/null 2>&1 || true
  fi
}

case "$ACTION" in
  refresh)
    run_ctx_refresh
    ;;
  refresh-bg)
    if [ -x "$CTX_SHIM" ]; then
      nohup "$CTX_SHIM" refresh --scope all >/dev/null 2>&1 &
    elif [ -d "${HOOKS_DIR}/ctx" ] && command -v python3 >/dev/null 2>&1; then
      nohup env PYTHONPATH="${HOOKS_DIR}${PYTHONPATH:+:$PYTHONPATH}" python3 -m ctx refresh --scope all >/dev/null 2>&1 &
    fi
    ;;
  second-brain-compact)
    run_second_brain_compact
    ;;
esac

case "$HOST" in
  cursor|agy|gemini|codex)
    printf '{}\n'
    ;;
esac

exit 0
