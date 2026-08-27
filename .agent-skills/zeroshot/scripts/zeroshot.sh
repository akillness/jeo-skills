#!/usr/bin/env bash
# Read-only ZeroShot operator helper.
#
# Usage:
#   zeroshot.sh doctor [repo]
#   zeroshot.sh setup-plan [repo]
#   zeroshot.sh preflight --repo DIR --input TEXT [options]
#   zeroshot.sh status [run-id]
#   zeroshot.sh validate-config FILE [--strict]
#
# The helper never starts, resumes, stops, kills, cleans, purges, schedules,
# creates a PR, or merges. preflight only prints a proposed command.

set -euo pipefail

say() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN %s\n' "$*" >&2
}

fail() {
  printf 'BLOCK %s\n' "$*" >&2
  exit 2
}

have() {
  command -v "$1" >/dev/null 2>&1
}

need_value() {
  if [ "$#" -lt 2 ] || [ -z "${2:-}" ]; then
    fail "$1 requires a value"
  fi
}

absolute_dir() {
  local candidate="$1"
  [ -d "$candidate" ] || fail "directory not found: $candidate"
  (cd "$candidate" && pwd -P)
}

absolute_file() {
  local candidate="$1"
  [ -f "$candidate" ] || fail "file not found: $candidate"
  [ ! -L "$candidate" ] || fail "file must not be a symlink: $candidate"
  local parent base
  parent="$(cd "$(dirname "$candidate")" && pwd -P)"
  base="$(basename "$candidate")"
  printf '%s/%s\n' "$parent" "$base"
}

is_git_repo() {
  git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

safe_remote() {
  local value="$1"
  local scheme rest authority
  case "$value" in
    *://*)
      scheme="${value%%://*}://"
      rest="${value#*://}"
      authority="${rest%%/*}"
      if [ "$authority" != "$rest" ]; then
        rest="${rest#*/}"
        case "$authority" in
          *@*) authority="[redacted]@${authority#*@}" ;;
        esac
        rest="$authority/$rest"
      else
        case "$rest" in
          *@*) rest="[redacted]@${rest#*@}" ;;
        esac
      fi
      rest="${rest%%\?*}"
      rest="${rest%%\#*}"
      printf '%s%s\n' "$scheme" "$rest"
      ;;
    *@*:*)
      printf '[redacted]@%s\n' "${value#*@}"
      ;;
    /*|./*|../*)
      printf 'LOCAL_PATH\n'
      ;;
    *)
      printf '%s\n' "$value"
      ;;
  esac
}

count_find() {
  local root="$1"
  local kind="$2"
  if [ ! -d "$root" ]; then
    printf '0'
    return
  fi
  if [ "$kind" = 'db' ]; then
    find "$root" -maxdepth 1 -type f -name '*.db' 2>/dev/null | wc -l | tr -d ' '
  else
    find "$root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '
  fi
}

print_binary() {
  local name="$1"
  if have "$name"; then
    printf 'binary.%-14s FOUND %s\n' "$name" "$(command -v "$name")"
  else
    printf 'binary.%-14s MISSING\n' "$name"
  fi
}

print_env_presence() {
  local name="$1"
  if printenv "$name" >/dev/null 2>&1; then
    printf 'env.%-17s SET\n' "$name"
  else
    printf 'env.%-17s MISSING\n' "$name"
  fi
}

node_major() {
  node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

provider_binary() {
  case "$1" in
    claude) printf 'claude' ;;
    codex) printf 'codex' ;;
    gemini) printf 'gemini' ;;
    opencode) printf 'opencode' ;;
    pi) printf 'pi' ;;
    omp|oh-my-pi) printf 'omp' ;;
    kiro) printf 'kiro-cli' ;;
    copilot) printf 'copilot' ;;
    gateway) printf 'node' ;;
    *) return 1 ;;
  esac
}

doctor() {
  local repo
  repo="$(absolute_dir "${1:-.}")"
  local node_ready=0
  local native_ready=0
  local git_ready=0

  say 'mode=doctor'
  say "repo=$repo"
  say "host.os=$(uname -s 2>/dev/null || printf unknown)"
  say "host.arch=$(uname -m 2>/dev/null || printf unknown)"

  if have node; then
    local nv major
    nv="$(node --version 2>/dev/null || true)"
    major="$(node_major || true)"
    say "node.version=${nv:-unknown}"
    if [ -n "$major" ] && [ "$major" -ge 22 ] 2>/dev/null; then
      node_ready=1
      say 'node.engine=PASS >=22'
    else
      say 'node.engine=BLOCK requires >=22'
    fi
  else
    say 'node.version=MISSING'
    say 'node.engine=BLOCK requires >=22'
  fi

  if have zeroshot; then
    say "zeroshot.path=$(command -v zeroshot)"
    say "zeroshot.version=$(zeroshot --version 2>/dev/null || printf unknown)"
    if [ "$node_ready" -eq 1 ]; then
      say 'node_product=READY'
    else
      say 'node_product=BLOCKED'
    fi
  else
    say 'zeroshot.path=MISSING'
    say 'node_product=BLOCKED'
  fi

  if have zeroshot-rust; then
    say "zeroshot_rust.path=$(command -v zeroshot-rust)"
    say "zeroshot_rust.version=$(zeroshot-rust --version 2>/dev/null || printf unknown)"
    native_ready=1
    say 'native_product=READY'
  else
    say 'zeroshot_rust.path=MISSING'
    say 'native_product=BLOCKED'
  fi

  if have git && is_git_repo "$repo"; then
    git_ready=1
    say 'git.repo=YES'
    say "git.root=$(git -C "$repo" rev-parse --show-toplevel)"
    say "git.branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)"
    local doctor_remote
    doctor_remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
    say "git.remote=$(if [ -n "$doctor_remote" ]; then safe_remote "$doctor_remote"; else printf MISSING; fi)"
    say "git.tracked_changes=$(git -C "$repo" status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
    say "git.untracked_entries=$(git -C "$repo" status --porcelain | grep '^??' | wc -l | tr -d ' ' || true)"
    if git -C "$repo" ls-files --error-unmatch .zeroshot/settings.json >/dev/null 2>&1; then
      say 'repo_settings=TRACKED'
    elif [ -e "$repo/.zeroshot/settings.json" ]; then
      say 'repo_settings=UNTRACKED'
    else
      say 'repo_settings=MISSING'
    fi
  else
    say 'git.repo=NO'
  fi

  if [ -n "${ZEROSHOT_SETTINGS_FILE:-}" ]; then
    say 'settings.source=ZEROSHOT_SETTINGS_FILE'
    if [ -L "$ZEROSHOT_SETTINGS_FILE" ]; then
      say 'settings.file=SYMLINK_REVIEW_REQUIRED'
    elif [ -f "$ZEROSHOT_SETTINGS_FILE" ]; then
      say 'settings.file=PRESENT'
    else
      say 'settings.file=MISSING'
    fi
  elif [ -n "${HOME:-}" ]; then
    say 'settings.source=DEFAULT_HOME'
    if [ -f "$HOME/.zeroshot/settings.json" ]; then
      say 'settings.file=PRESENT'
    else
      say 'settings.file=MISSING'
    fi
  else
    say 'settings.source=UNKNOWN_HOME_UNSET'
    say 'settings.file=UNKNOWN'
  fi

  if [ -n "${HOME:-}" ]; then
    say "ledger.databases=$(count_find "$HOME/.zeroshot" db)"
    say "ledger.worktrees=$(count_find "$HOME/.zeroshot/worktrees" dir)"
  else
    say 'ledger.databases=UNKNOWN'
    say 'ledger.worktrees=UNKNOWN'
  fi

  for binary in docker gh glab az claude codex gemini opencode pi omp kiro-cli copilot; do
    print_binary "$binary"
  done
  for variable in ZEROSHOT_SETTINGS_FILE GH_TOKEN ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY OPENROUTER_API_KEY; do
    print_env_presence "$variable"
  done

  if [ "$git_ready" -eq 0 ]; then
    warn 'Node software-change runs need a Git repository for the safe worktree lane'
  fi
  if [ "$native_ready" -eq 1 ] || { have zeroshot && [ "$node_ready" -eq 1 ]; }; then
    say 'result=READY_AT_LEAST_ONE_PRODUCT'
    return 0
  fi
  say 'result=BLOCKED_NO_READY_PRODUCT'
  return 1
}

setup_plan() {
  local repo
  repo="$(absolute_dir "${1:-.}")"
  have zeroshot || fail 'zeroshot is not installed'
  say '# Upstream read-only setup contract; source tests prohibit secret-shaped fields.'
  (cd "$repo" && zeroshot setup plan --json)
}

append_quoted() {
  local value="$1"
  printf '%q' "$value"
}

preflight() {
  local repo='.'
  local input=''
  local provider=''
  local config=''
  local isolation='worktree'
  local delivery='none'
  local pr_base=''
  local workers=''
  local sim='fast'
  local detach=0
  local allow_current=0
  local allow_ship=0
  local allow_default_mounts=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo)
        need_value "$@"
        repo="$2"
        shift 2
        ;;
      --input)
        need_value "$@"
        input="$2"
        shift 2
        ;;
      --provider)
        need_value "$@"
        provider="$2"
        shift 2
        ;;
      --config)
        need_value "$@"
        config="$2"
        shift 2
        ;;
      --isolation)
        need_value "$@"
        isolation="$2"
        shift 2
        ;;
      --delivery)
        need_value "$@"
        delivery="$2"
        shift 2
        ;;
      --base)
        need_value "$@"
        pr_base="$2"
        shift 2
        ;;
      --workers)
        need_value "$@"
        workers="$2"
        shift 2
        ;;
      --sim)
        need_value "$@"
        sim="$2"
        shift 2
        ;;
      --detach)
        detach=1
        shift
        ;;
      --allow-current-checkout)
        allow_current=1
        shift
        ;;
      --allow-ship)
        allow_ship=1
        shift
        ;;
      --allow-default-mounts)
        allow_default_mounts=1
        shift
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *) fail "unknown preflight option: $1" ;;
    esac
  done

  [ -n "$input" ] || fail 'preflight requires --input'
  case "$input" in
    -*) fail 'input beginning with a dash is ambiguous; use a file or wording without a leading dash' ;;
  esac
  case "$isolation" in
    worktree|docker|none) ;;
    *) fail '--isolation must be worktree, docker, or none' ;;
  esac
  case "$delivery" in
    none|pr|ship) ;;
    *) fail '--delivery must be none, pr, or ship' ;;
  esac
  case "$sim" in
    off|fast|deep) ;;
    *) fail '--sim must be off, fast, or deep' ;;
  esac
  if [ -n "$workers" ]; then
    case "$workers" in
      *[!0-9]*|'') fail '--workers must be a positive integer' ;;
    esac
    [ "$workers" -gt 0 ] 2>/dev/null || fail '--workers must be a positive integer'
  fi

  repo="$(absolute_dir "$repo")"
  have git || fail 'git is required for the Node software-change lane'
  is_git_repo "$repo" || fail "not a Git worktree: $repo"
  have node || fail 'node is required for the established ZeroShot product'
  local major
  major="$(node_major || true)"
  if [ -z "$major" ] || [ "$major" -lt 22 ] 2>/dev/null; then
    fail 'the established ZeroShot product requires Node.js 22 or newer'
  fi
  have zeroshot || fail 'zeroshot is not installed; preflight cannot propose an executable run'

  if [ "$isolation" = 'none' ] && [ "$allow_current" -ne 1 ]; then
    fail 'current-checkout mutation requires --allow-current-checkout after explicit user approval'
  fi
  if [ "$delivery" = 'ship' ] && [ "$allow_ship" -ne 1 ]; then
    fail 'auto-merge delivery requires --allow-ship after explicit user approval'
  fi
  if [ "$delivery" != 'none' ] && [ "$isolation" = 'none' ]; then
    fail 'PR and ship delivery cannot use current-checkout isolation'
  fi
  if [ "$isolation" = 'docker' ] && ! have docker; then
    fail 'Docker isolation requested but docker is not installed'
  fi
  if [ "$allow_default_mounts" -eq 1 ] && [ "$isolation" != 'docker' ]; then
    fail '--allow-default-mounts is valid only with Docker isolation'
  fi
  if [ "$delivery" = 'none' ] && [ -n "$pr_base" ]; then
    fail '--base is valid only with PR or ship delivery'
  fi
  if [ "$delivery" != 'none' ]; then
    [ -n "$pr_base" ] || fail 'PR or ship delivery requires --base to pin the target branch'
    local normalized_base
    normalized_base="$(git check-ref-format --branch "$pr_base" 2>/dev/null)" || fail 'invalid --base branch name'
    [ "$normalized_base" = "$pr_base" ] || fail '--base must name a literal branch, not a checkout shorthand'
  fi

  local remote
  remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
  if [ "$delivery" != 'none' ] && [ -z "$remote" ]; then
    fail 'PR or ship delivery requires an origin remote'
  fi
  if [ "$delivery" != 'none' ]; then
    case "$remote" in
      *github.com*) have gh || fail 'GitHub delivery requires gh' ;;
      *gitlab*) have glab || fail 'GitLab delivery requires glab' ;;
      *dev.azure.com*|*visualstudio.com*) have az || fail 'Azure DevOps delivery requires az' ;;
      *) fail 'delivery remote is not recognized as GitHub, GitLab, or Azure DevOps' ;;
    esac
  fi

  [ -n "$provider" ] || fail 'preflight requires --provider so a saved default cannot silently decide the run'
  local provider_cli
  provider_cli="$(provider_binary "$provider" 2>/dev/null || true)"
  [ -n "$provider_cli" ] || fail "unsupported provider id: $provider"
  if [ "$provider" != 'gateway' ] && ! have "$provider_cli"; then
    fail "provider $provider requires $provider_cli on PATH"
  fi

  if [ -n "$config" ]; then
    config="$(absolute_file "$config")"
    if have zeroshot; then
      (cd "$repo" && zeroshot config validate "$config" --strict --json >/dev/null)
      say 'config.validation=PASS upstream strict validator'
    elif have node; then
      node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$config"
      say 'config.validation=PARTIAL JSON syntax only; install Zeroshot for semantic validation'
    else
      fail 'config supplied but neither zeroshot nor node can validate it'
    fi
  fi

  say 'mode=preflight'
  say "repo=$repo"
  say "git.branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)"
  say "git.remote=$(if [ -n "$remote" ]; then safe_remote "$remote"; else printf MISSING; fi)"
  say "git.tracked_changes=$(git -C "$repo" status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
  say "isolation=$isolation"
  if [ "$isolation" = 'docker' ]; then
    if [ "$allow_default_mounts" -eq 1 ]; then
      say 'docker_mounts=SAVED_DEFAULTS_EXPLICITLY_APPROVED'
    else
      say 'docker_mounts=DISABLED_BY_PREFLIGHT_DEFAULT'
    fi
  fi
  say "delivery=$delivery"
  say "base=${pr_base:-NOT_APPLICABLE}"
  say "provider=$provider"
  if [ "$provider" = 'gateway' ]; then
    say 'provider.configuration=NOT_VALIDATED_UPSTREAM_RUN_PREFLIGHT_REMAINS_AUTHORITATIVE'
  else
    say 'provider.authentication=NOT_VALIDATED_PROVIDER_CLI_OWNS_LOGIN'
  fi
  say "config=${config:-CONDUCTOR_DEFAULT}"
  say "workers=${workers:-WORKFLOW_DEFAULT}"
  say "simulation=$sim"
  say "detach=$detach"
  say 'cost_and_mutation=NOT_EXECUTED'
  say 'approval=REQUIRED_BEFORE_COPYING_COMMAND'

  printf 'proposed_command='
  append_quoted zeroshot
  printf ' '
  append_quoted run
  printf ' '
  append_quoted "$input"
  case "$isolation" in
    worktree) printf ' --worktree' ;;
    docker)
      printf ' --docker'
      if [ "$allow_default_mounts" -ne 1 ]; then
        printf ' --no-mounts'
      fi
      ;;
    none) printf ' --no-isolation' ;;
  esac
  case "$delivery" in
    pr) printf ' --pr --pr-base '; append_quoted "$pr_base" ;;
    ship) printf ' --ship --pr-base '; append_quoted "$pr_base" ;;
  esac
  if [ -n "$provider" ]; then
    printf ' --provider '
    append_quoted "$provider"
  fi
  if [ -n "$config" ]; then
    printf ' --config '
    append_quoted "$config"
  fi
  if [ -n "$workers" ]; then
    printf ' --workers '
    append_quoted "$workers"
  fi
  printf ' --sim '
  append_quoted "$sim"
  if [ "$detach" -eq 1 ]; then
    printf ' --detach'
  fi
  printf '\n'
  say 'result=READY_TO_REQUEST_APPROVAL'
}

status_report() {
  have zeroshot || fail 'zeroshot is not installed'
  if [ "$#" -eq 0 ]; then
    exec zeroshot list --json
  fi
  [ "$#" -eq 1 ] || fail 'status accepts at most one run id'
  case "$1" in
    ''|*[!A-Za-z0-9._-]*) fail 'run id must contain only letters, digits, dot, underscore, and hyphen' ;;
  esac
  exec zeroshot status "$1" --json
}

validate_config() {
  [ "$#" -ge 1 ] || fail 'validate-config requires a JSON file'
  [ "$#" -le 2 ] || fail 'validate-config accepts FILE and optional --strict'
  local file="$1"
  local strict=''
  if [ "$#" -eq 2 ]; then
    [ "$2" = '--strict' ] || fail 'second argument must be --strict'
    strict='--strict'
  fi
  [ -f "$file" ] || fail "config file not found: $file"
  [ ! -L "$file" ] || fail "config must not be a symlink: $file"
  have zeroshot || fail 'zeroshot is required for semantic config validation'
  if [ -n "$strict" ]; then
    exec zeroshot config validate "$file" --strict --json
  fi
  exec zeroshot config validate "$file" --json
}

usage() {
  sed -n '2,11p' "$0"
}

main() {
  local command="${1:-help}"
  if [ "$#" -gt 0 ]; then
    shift
  fi
  case "$command" in
    doctor) doctor "$@" ;;
    setup-plan) setup_plan "$@" ;;
    preflight) preflight "$@" ;;
    status) status_report "$@" ;;
    validate-config) validate_config "$@" ;;
    help|-h|--help) usage ;;
    *) usage >&2; fail "unknown command: $command" ;;
  esac
}

main "$@"
