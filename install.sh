#!/usr/bin/env bash
# Bootstrap one shared router, then let that router resolve the requested target.
set -euo pipefail

REPO_URL="${JEO_SKILLS_SOURCE:-https://github.com/akillness/jeo-skills}"
SELECTION="${JEO_SKILLS_SELECTION:-router}"
AGENT="${JEO_SKILLS_AGENT:-universal}"
JEV_PROFILE="${JEO_SKILLS_JEV_PROFILE:-$AGENT}"
GLOBAL="${INSTALL_GLOBAL:-true}"
DRY_RUN="${JEO_SKILLS_DRY_RUN:-false}"
STAR_ONLY="${JEO_SKILLS_STAR_ONLY:-false}"
PROJECT_DIR="$(pwd -P)"
info() { printf '[jeo-skills] %s\n' "$*"; }
fail() { printf '[jeo-skills] ERROR: %s\n' "$*" >&2; exit 1; }

case "$STAR_ONLY" in true|false) ;; *) fail 'JEO_SKILLS_STAR_ONLY must be true or false' ;; esac
case "$DRY_RUN" in true|false) ;; *) fail 'JEO_SKILLS_DRY_RUN must be true or false' ;; esac
if [ "$STAR_ONLY" != true ]; then
case "$GLOBAL:$DRY_RUN" in true:true|true:false|false:true|false:false) ;; *) fail 'INSTALL_GLOBAL and JEO_SKILLS_DRY_RUN must be true or false' ;; esac
case "$SELECTION" in router|bundle|all) ;; category) [ -n "${JEO_SKILLS_CATEGORY:-}" ] || fail 'JEO_SKILLS_CATEGORY is required' ;; *) fail 'JEO_SKILLS_SELECTION must be router, bundle, category, or all' ;; esac
if [ "$AGENT" = aside ] && [ "$GLOBAL" != true ]; then fail 'Aside is account-scoped; INSTALL_GLOBAL=true is required'; fi
JEV_STATUS=0
JEV_REQUESTED=false
if [ -n "${JEO_SKILLS_JEV:-}" ] && [ "${JEO_SKILLS_JEV:-}" != skip ]; then JEV_REQUESTED=true; fi
case "${JEO_SKILLS_JEV:-}" in ''|skip|api|local|ollama|lmstudio|systemone) ;; *) info 'WARNING: Invalid optional JEO_SKILLS_JEV; skipping Jev. JEO_SKILLS_JEV must be skip, api, local, ollama, lmstudio, or systemone. Continuing skill installation.'; JEV_STATUS=1; JEO_SKILLS_JEV=skip ;; esac
if [ "$GLOBAL" != true ] && [ -n "${JEO_SKILLS_JEV:-}" ] && [ "${JEO_SKILLS_JEV:-}" != skip ]; then
  info 'WARNING: Jev is home-scoped; skipping optional Jev for project installation. Run approved standalone setup separately.'
  JEV_STATUS=1
  JEO_SKILLS_JEV=skip
fi

ROOT="$PWD/.agents/skills"
if [ "$GLOBAL" = true ]; then ROOT="$HOME/.agents/skills"; fi
CLI_PATH="$ROOT/jeo-skill/scripts/jeo-skill.py"
TARGET_ARGS=(--source "$REPO_URL" --agent "$AGENT")
if [ -n "${JEO_SKILLS_ASIDE_HOME:-}" ]; then TARGET_ARGS+=(--aside-home "$JEO_SKILLS_ASIDE_HOME"); fi
if [ -n "${JEO_SKILLS_ASIDE_ACCOUNT:-}" ]; then TARGET_ARGS+=(--aside-account "$JEO_SKILLS_ASIDE_ACCOUNT"); fi
ADD_ARGS=(--skill jeo-skill --agent universal --yes --copy --full-depth)
if [ "$GLOBAL" = true ]; then ADD_ARGS+=(--global); TARGET_ARGS+=(--global); fi
SELECT_ARGS=()
case "$SELECTION" in
  bundle) SELECT_ARGS=(--bundle "${JEO_SKILLS_BUNDLE:-starter}") ;;
  category) SELECT_ARGS=(--category "$JEO_SKILLS_CATEGORY"); if [ -n "${JEO_SKILLS_SUBCATEGORY:-}" ]; then SELECT_ARGS+=(--subcategory "$JEO_SKILLS_SUBCATEGORY"); fi ;;
  all) SELECT_ARGS=(--all) ;;
esac
fi

if [ "$STAR_ONLY" = true ]; then
  if [ "$DRY_RUN" = true ]; then
    info 'Star-only dry run: no GitHub calls made.'
    exit 0
  fi
  if [ "${JEO_SKILLS_STAR:-}" != true ]; then
    info 'Star skipped: star-only mode requires JEO_SKILLS_STAR=true explicit consent.'
    exit 0
  fi
fi

if [ "$DRY_RUN" = true ]; then
  printf 'Command: '; printf '%q ' npx --yes skills@1.7.0 add "$REPO_URL" "${ADD_ARGS[@]}"; printf '\n'
  printf 'Command: '; printf '%q ' python3 "$CLI_PATH" bootstrap "${TARGET_ARGS[@]}"; printf '\n'
  if [ "$SELECTION" != router ]; then
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" install "${TARGET_ARGS[@]}" "${SELECT_ARGS[@]}" --yes; printf '\n'
  fi
  if [ "$SELECTION" = all ]; then
    if [ "$GLOBAL" = true ]; then
      info "Would obtain scripts/install-full-tools.sh from $REPO_URL and run it for project $PROJECT_DIR."
      info 'Would install or update mex-agent, zvec-grep, specify-cli, RTK, Semble, and cli-anything-hub in the user-global scope; no tools are run during dry run.'
      if [ -n "${JEO_SECOND_BRAIN_CONFIG:-}" ]; then
        info "Would configure obsidian-second-brain from $JEO_SECOND_BRAIN_CONFIG after explicit target/model/cost/automation consent; no setup runs during dry run."
      else
        info 'Second-brain setup requires JEO_SECOND_BRAIN_CONFIG; no existing vault or hook is migrated.'
      fi
    else
      info 'Project-scoped all would skip user-global tool installation and report partial success; set INSTALL_GLOBAL=true to allow global installation.'
    fi
  fi
  if [ "$GLOBAL" = true ]; then
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" prune-retired --global; printf '\n'
  else
    printf 'Command: '; printf '%q ' python3 "$CLI_PATH" prune-retired; printf '\n'
  fi
  info "Dry run: shared router destination $ROOT; bootstrap resolves target $AGENT; no changes made."
  info 'Runtime support, account selection, and catalog selections are validated during execution, not by this bootstrap preview.'
  info "After install, optional Jev setup targets profile '$JEV_PROFILE'; set JEO_SKILLS_JEV_PROFILE for an independent profile when AGENT=universal."

  exit 0
fi

command -v python3 >/dev/null 2>&1 || fail 'Python 3.9+ is required'
python3 -I -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1 || fail 'python3 is not usable; check your Python installation or Xcode license'
if [ "$STAR_ONLY" != true ]; then
command -v node >/dev/null 2>&1 || fail 'Node.js 22.20+ is required by skills@1.7.0'
node -e 'const v=process.versions.node.split(".").map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=20)?0:1)' || fail 'Node.js 22.20+ is required by skills@1.7.0'
command -v npx >/dev/null 2>&1 || fail 'Node.js/npx is required'
npx --version >/dev/null 2>&1 || fail 'npx does not run; reinstall Node.js'
fi
# Starring is a separate account action, never implied by installation approval.
STAR="${JEO_SKILLS_STAR:-}"
if [ -z "$STAR" ] && [ -t 0 ]; then
  printf 'Star akillness/jeo-skills on github.com using the active gh credential now? GH_TOKEN, then GITHUB_TOKEN, override stored credentials; gh may refresh its credential. [y/N] '
  IFS= read -r STAR || STAR=''
  case "$STAR" in y|Y|yes|YES) STAR=true ;; *) STAR=false ;; esac
fi
case "$STAR" in
  true)
    info 'Using the active github.com gh credential (GH_TOKEN, then GITHUB_TOKEN, override stored credentials); gh may refresh its credential.'
    if python3 -I - <<'PY'
import sys
import os
import subprocess

env = dict(os.environ, GH_PROMPT_DISABLED='1', GH_NO_UPDATE_NOTIFIER='1')
worker = '''
import http.client, sys
token = sys.stdin.read()
connection = http.client.HTTPSConnection('api.github.com', timeout=10)
try:
    connection.request(sys.argv[1], '/user/starred/akillness/jeo-skills', headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'jeo-skills-installer',
        'Content-Length': '0',
    })
    print(connection.getresponse().status)
finally:
    connection.close()
'''
try:
    token_result = subprocess.run(
        ['gh', 'auth', 'token', '--hostname', 'github.com'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=False, env=env,
    )
    token = token_result.stdout.decode('utf-8').strip()
    if token_result.returncode != 0 or not token or '\n' in token or '\r' in token:
        raise ValueError('gh authentication unavailable')
except (FileNotFoundError, subprocess.TimeoutExpired, OSError, UnicodeError, ValueError):
    print('[jeo-skills] WARNING: GitHub star unverified: gh authentication unavailable or timed out.')
    sys.exit(1)
else:
    for method in ('PUT', 'GET'):
        try:
            response = subprocess.run(
                [sys.executable, '-I', '-c', worker, method], input=token.encode(),
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            print(f'[jeo-skills] WARNING: GitHub star unverified: {method} failed or timed out.')
            sys.exit(1)
        if response.returncode != 0 or response.stdout.strip() != b'204':
            print(f'[jeo-skills] WARNING: GitHub star unverified: {method} failed or did not return HTTP 204; redirects are not followed. Check gh authentication and access.')
            sys.exit(1)
    else:
        print('[jeo-skills] GitHub star verified for akillness/jeo-skills.')
PY
    then :
    elif [ "$STAR_ONLY" = true ]; then exit 1
    fi
    ;;
  ''|false) ;;
  *) info 'WARNING: Invalid JEO_SKILLS_STAR; star skipped. Use true or false.' ;;
esac
if [ "$STAR_ONLY" = true ]; then exit 0; fi
# Do not allow the bootstrap transport to replace linked user installations.
python3 -I - "$ROOT" "$HOME" "$PWD" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
scope = pathlib.Path(sys.argv[2]) if pathlib.Path(sys.argv[2]) in root.parents else pathlib.Path(sys.argv[3])
parents = list(root.parents)
parents = parents[:parents.index(scope) + 1] if scope in parents else []
for path in (root, *parents, root / 'jeo-skill'):
    if path.is_symlink():
        sys.exit(f'Refusing symlink destination: {path}')
if (root / 'jeo-skill').is_dir():
    for path in (root / 'jeo-skill').rglob('*'):
        if path.is_symlink():
            sys.exit(f'Refusing symlink in router tree: {path}')
PY

info 'Installing the lightweight shared jeo-skill router'
npx --yes skills@1.7.0 add "$REPO_URL" "${ADD_ARGS[@]}"
[ -f "$CLI_PATH" ] && [ -f "$ROOT/jeo-skill/SKILL.md" ] && [ -f "$ROOT/jeo-skill/scripts/install_support.py" ] || fail "Router verification failed at $ROOT"
python3 "$CLI_PATH" bootstrap "${TARGET_ARGS[@]}"
if [ "$SELECTION" != router ]; then
  python3 "$CLI_PATH" install "${TARGET_ARGS[@]}" "${SELECT_ARGS[@]}" --yes
fi
FULL_STATUS=0
if [ "$SELECTION" = all ] && [ "$GLOBAL" != true ]; then
  info 'WARNING: Partial success: project-scoped skills installed, but user-global tools were not installed. Set INSTALL_GLOBAL=true to allow global tool installation.' >&2
  FULL_STATUS=1
elif [ "$SELECTION" = all ]; then
  FULL_HELPER=''
  FULL_TMP=''
  if [ -d "$REPO_URL" ]; then
    FULL_HELPER="$REPO_URL/scripts/install-full-tools.sh"
  elif [ "$REPO_URL" = 'https://github.com/akillness/jeo-skills' ] && [ -f "${BASH_SOURCE[0]:-}" ] && [ "$(basename "${BASH_SOURCE[0]}")" = install.sh ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/scripts/install-full-tools.sh" ]; then
    FULL_HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/scripts/install-full-tools.sh"
  elif FULL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/jeo-full.XXXXXX")"; then
    FULL_HELPER="$FULL_TMP/install-full-tools.sh"
    if [ "$REPO_URL" = 'https://github.com/akillness/jeo-skills' ]; then
      curl -fsSL 'https://raw.githubusercontent.com/akillness/jeo-skills/main/scripts/install-full-tools.sh' -o "$FULL_HELPER" || FULL_HELPER=''
    else
      git clone --quiet --depth 1 -- "$REPO_URL" "$FULL_TMP/source" && FULL_HELPER="$FULL_TMP/source/scripts/install-full-tools.sh" || FULL_HELPER=''
    fi
  fi
  if [ -z "$FULL_HELPER" ] || [ ! -f "$FULL_HELPER" ]; then
    info 'ERROR: Full tool helper unavailable; skills were installed but tool installation did not complete.' >&2
    FULL_STATUS=1
  elif ! bash "$FULL_HELPER" "$PROJECT_DIR"; then
    info 'WARNING: Full tool installation partially failed; installed skills remain available.' >&2
    FULL_STATUS=1
  fi
  if [ -n "$FULL_TMP" ]; then rm -rf "$FULL_TMP" || info 'WARNING: Full tool temporary cleanup failed.'; fi
fi

# New knowledge installs use second brain; selection/--yes is not model or job consent.
if [ "$SELECTION" = all ] && [ "$GLOBAL" = true ]; then
  if [ -z "${JEO_SECOND_BRAIN_CONFIG:-}" ]; then
    info 'Second-brain activation pending: provide JEO_SECOND_BRAIN_CONFIG with a NEW vault, model, cost allowance and explicit automation consent. Existing knowledge settings are unchanged.'
  else
    BRAIN_SETUP="$ROOT/obsidian-second-brain/scripts/setup.py"
    BRAIN_ARGS=(--config "$JEO_SECOND_BRAIN_CONFIG")
    if [ -n "${JEO_SECOND_BRAIN_SOURCE:-}" ]; then BRAIN_ARGS+=(--source "$JEO_SECOND_BRAIN_SOURCE"); fi
    if [ ! -f "$BRAIN_SETUP" ]; then
      info 'ERROR: Installed obsidian-second-brain setup helper is missing.' >&2
      FULL_STATUS=1
    elif ! python3 "$BRAIN_SETUP" "${BRAIN_ARGS[@]}"; then
      info 'ERROR: Second-brain setup did not complete; existing knowledge settings were not migrated.' >&2
      FULL_STATUS=1
    fi
  fi
fi
# Remove stale catalog copies of retired skills (jeo, harness) from every runtime root in scope.
if [ "$GLOBAL" = true ]; then
  python3 "$CLI_PATH" prune-retired --global || info 'WARNING: retired-skill cleanup did not complete; installed skills remain available.'
else
  python3 "$CLI_PATH" prune-retired || info 'WARNING: retired-skill cleanup did not complete; installed skills remain available.'
fi
if [ "$GLOBAL" = true ] && ! command -v jeo-skill >/dev/null 2>&1; then
  info 'Add $HOME/.local/bin to PATH to use jeo-skill.'
fi

# Optional Jev control plane (interactive TUI; JEO_SKILLS_JEV=skip|api|local|ollama|lmstudio|systemone to force).
if [ "$GLOBAL" = true ] && [ "${JEO_SKILLS_JEV:-}" != skip ] && { [ -n "${JEO_SKILLS_JEV:-}" ] || [ -t 0 ]; }; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "$PWD")"
  if [ -f "$SCRIPT_DIR/jev/jev-setup.sh" ]; then
    if ! bash "$SCRIPT_DIR/jev/jev-setup.sh" --profile "$JEV_PROFILE" --agent "$AGENT"; then
      info 'WARNING: Jev setup did not complete; installed skills remain available. Re-run approved standalone setup later.' >&2
      if [ "$JEV_REQUESTED" = true ]; then JEV_STATUS=1; fi
    fi
  else
    JEV_SETUP_URL="${JEO_SKILLS_RAW_BASE:-https://raw.githubusercontent.com/akillness/jeo-skills/main/jev}/jev-setup.sh"
    if JEV_SETUP_TMP="$(mktemp -d "${TMPDIR:-/tmp}/jev-setup.XXXXXX")"; then
      trap 'rm -rf "$JEV_SETUP_TMP" || info "WARNING: Optional Jev temporary setup cleanup failed."' EXIT
      if ! curl -fsSL "$JEV_SETUP_URL" -o "$JEV_SETUP_TMP/jev-setup.sh" 2>/dev/null \
        || ! bash "$JEV_SETUP_TMP/jev-setup.sh" --profile "$JEV_PROFILE" --agent "$AGENT"; then
        info 'WARNING: Jev setup unavailable or failed; installed skills remain available. Run approved standalone setup later.' >&2
        if [ "$JEV_REQUESTED" = true ]; then JEV_STATUS=1; fi
      fi
      rm -rf "$JEV_SETUP_TMP" || info 'WARNING: Optional Jev temporary setup cleanup failed.'
      trap - EXIT
    else
      info 'WARNING: Cannot create private Jev setup directory; skipping Jev. Installed skills remain available.' >&2
      if [ "$JEV_REQUESTED" = true ]; then JEV_STATUS=1; fi
    fi
  fi
fi
if [ "$FULL_STATUS" != 0 ]; then
  info 'Selected skills installed; a required full-install component did not complete (see errors above).'
elif [ "$JEV_STATUS" != 0 ]; then
  info 'Selected skills installed; requested optional Jev setup did not complete (see warnings above).'
else
  info 'Selected installation completed; runtime activation may require a reload.'
fi
exit "$FULL_STATUS"

