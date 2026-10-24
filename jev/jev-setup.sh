#!/usr/bin/env bash
# Interactive (TUI) optional setup for the Jev control plane, run from install.sh
# or standalone. Non-interactive override: JEO_SKILLS_JEV=skip|api|local|ollama|lmstudio|systemone
#   api      also reads JEV_API_KEY from the environment
#   local    also downloads autotrust/JEV-9B unless JEV_SKIP_MODEL_DOWNLOAD=true
#   ollama   pulls the quantized GGUF (Q4_K_M, ~5.6 GB) via the ollama CLI
#   lmstudio points the harness at LM Studio's OpenAI server (macOS)
#   systemone configures an operator-provided System One endpoint (no downloads or server start)
set -euo pipefail

JEV_HOME="$HOME/.agents/jev"
RULES_DIR="$HOME/.agents/rules"
RAW_BASE="${JEO_SKILLS_RAW_BASE:-https://raw.githubusercontent.com/akillness/jeo-skills/main/jev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES=(jev-setup.sh jev-harness.mjs jev_local_server.py README.md jev-control-plane.rule.md)
[ -f "$SCRIPT_DIR/jev-plugin.mjs" ] && FILES+=(jev-plugin.mjs)
NATIVE_PLUGIN_DIR="$SCRIPT_DIR/plugins"
NATIVE_PLUGIN_FILES=(
  plugins/shared/jev-controller.mjs
  plugins/claude/shared/jev-controller.mjs
  plugins/claude/hooks/jev-hook.mjs
  plugins/claude/hooks/hooks.json
  plugins/claude/.claude-plugin/plugin.json
  plugins/omp/index.mjs
  plugins/omp/package.json
  plugins/omp/shared/jev-controller.mjs
  plugins/pi/index.mjs
  plugins/pi/package.json
  plugins/pi/shared/jev-controller.mjs
  plugins/jeopi/index.mjs
  plugins/jeopi/package.json
  plugins/jeopi/shared/jev-controller.mjs
)
STANDALONE_SETUP=false
[ -f "$SCRIPT_DIR/jev-harness.mjs" ] || STANDALONE_SETUP=true

bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true); reset=$(tput sgr0 2>/dev/null || true)
info() { printf '%s[jev-setup]%s %s\n' "$bold" "$reset" "$*"; }
fail() { printf '[jev-setup] ERROR: %s\n' "$*" >&2; exit 1; }

PROFILE="${JEV_PROFILE:-}"
AGENT_TARGET="${JEO_SKILLS_AGENT:-}"
ACTION=configure
MODE="${JEO_SKILLS_JEV:-}"
MODE_CLI_SET=false
CONFIG_ONLY=false
ENDPOINT_OVERRIDE=""
ENDPOINT_OVERRIDE_SET=false
MODEL_OVERRIDE=""
MODEL_OVERRIDE_SET=false
MODEL_DIR_OVERRIDE=""
MODEL_DIR_OVERRIDE_SET=false
KEY_ENV=""
KEY_ENV_SET=false
ROUTE_BACKEND=""
PRUNE_BACKEND=""
REVIEW_BACKEND=""
ROUTE_FALLBACK=""
PRUNE_FALLBACK=""
REVIEW_FALLBACK=""
VALIDATED_MODEL=""
validate_kind() {
  case "$1" in api|local|ollama|lmstudio|systemone) ;; *) fail "Unknown backend kind '$1'; expected api, local, ollama, lmstudio, or systemone" ;; esac
}
validate_operation() {
  case "$1" in route-skills|prune-context|review) ;; *) fail "Unknown fallback operation '$1'; expected route-skills, prune-context, or review" ;; esac
}
parse_fallback() {
  local spec="$1" operation kinds kind old_ifs
  case "$spec" in *=*) ;; *) fail '--fallback requires <op>=<kind[,kind]>' ;; esac
  operation="${spec%%=*}"
  kinds="${spec#*=}"
  validate_operation "$operation"
  [ -n "$kinds" ] || fail '--fallback requires at least one backend kind'
  case "$kinds" in ,*|*,|*,,*) fail '--fallback backend list contains an empty kind' ;; esac
  old_ifs="$IFS"; IFS=','
  for kind in $kinds; do validate_kind "$kind"; done
  IFS="$old_ifs"
  case "$operation" in
    route-skills) ROUTE_FALLBACK="$kinds" ;;
    prune-context) PRUNE_FALLBACK="$kinds" ;;
    review) REVIEW_FALLBACK="$kinds" ;;
  esac
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--profile requires a non-empty profile id'
      PROFILE="$2"; shift 2 ;;
    --agent)
      [ "$#" -ge 2 ] || fail '--agent requires a runtime target'
      AGENT_TARGET="$2"; shift 2 ;;
    --mode)
      [ "$#" -ge 2 ] || fail '--mode requires api, local, ollama, lmstudio, or systemone'
      MODE="$2"; MODE_CLI_SET=true; shift 2 ;;
    --config-only)
      CONFIG_ONLY=true; shift ;;
    --endpoint)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--endpoint requires a non-empty URL'
      ENDPOINT_OVERRIDE="$2"; ENDPOINT_OVERRIDE_SET=true; shift 2 ;;
    --model)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--model requires a non-empty model id'
      MODEL_OVERRIDE="$2"; MODEL_OVERRIDE_SET=true; shift 2 ;;
    --model-dir)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--model-dir requires a non-empty path'
      MODEL_DIR_OVERRIDE="$2"; MODEL_DIR_OVERRIDE_SET=true; shift 2 ;;
    --key-env)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--key-env requires a non-empty environment variable name'
      KEY_ENV="$2"; KEY_ENV_SET=true; shift 2 ;;
    --route-backend)
      [ "$#" -ge 2 ] || fail '--route-backend requires a backend kind'
      validate_kind "$2"; ROUTE_BACKEND="$2"; shift 2 ;;
    --prune-backend)
      [ "$#" -ge 2 ] || fail '--prune-backend requires a backend kind'
      validate_kind "$2"; PRUNE_BACKEND="$2"; shift 2 ;;
    --review-backend)
      [ "$#" -ge 2 ] || fail '--review-backend requires a backend kind'
      validate_kind "$2"; REVIEW_BACKEND="$2"; shift 2 ;;
    --fallback)
      [ "$#" -ge 2 ] || fail '--fallback requires <op>=<kind[,kind]>'
      parse_fallback "$2"; shift 2 ;;
    --validated-model)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--validated-model requires a non-empty model id'
      VALIDATED_MODEL="$2"; shift 2 ;;
    --enable) ACTION=enable; shift ;;
    --disable) ACTION=disable; shift ;;
    --status) ACTION=status; shift ;;
    --help|-h)
      printf 'Usage: jev-setup.sh [--profile <id>] [--agent <runtime>] [--mode api|local|ollama|lmstudio|systemone]\n'
      printf '       [--config-only] [--endpoint <url>] [--model <id>] [--model-dir <path>] [--key-env <ENVNAME>]\n'
      printf '       [--route-backend <kind>] [--prune-backend <kind>] [--review-backend <kind>]\n'
      printf '       [--fallback <op>=<kind[,kind]>] [--validated-model <id>]\n'
      printf '       jev-setup.sh --profile <id> --enable|--disable|--status\n'
      exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
validate_env_name() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail 'Secret environment name must match [A-Za-z_][A-Za-z0-9_]*'
}
validate_flag_value() {
  local value="$1" label="$2"
  case "$value" in *$'\n'*|*$'\r'*) fail "$label must be single-line" ;; esac
  case "$value" in *'='*) fail "$label must not contain '='" ;; esac
}
validate_endpoint_url() {
  local url="$1" label="${2:-Endpoint}" authority host port
  [ -n "$url" ] || fail "$label must be a non-empty URL"
  validate_flag_value "$url" "$label"
  case "$url" in http://*|https://*) ;; *) fail "$label must use http:// or https://" ;; esac
  case "$url" in *'@'*|*'?'*|*'#'*|*' '*) fail "$label must not contain userinfo, query, hash, or spaces" ;; esac
  authority="${url#*://}"; authority="${authority%%/*}"
  [ -n "$authority" ] || fail "$label must include a host"
  case "$authority" in
    \[*\]:*) host="${authority%%]*}]"; host="${host#\[}"; host="${host%]}"; port="${authority##*]:}" ;;
    \[*\]) host="${authority#\[}"; host="${host%]}"; port="" ;;
    *:*) host="${authority%%:*}"; port="${authority##*:}" ;;
    *) host="$authority"; port="" ;;
  esac
  [ -n "$host" ] || fail "$label must include a host"
  if [ -n "$port" ]; then
    [[ "$port" =~ ^[0-9]+$ ]] || fail "$label port must be numeric"
    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail "$label port must be 1-65535"
  fi
}
validate_local_endpoint() {
  local url="$1" authority host port
  validate_endpoint_url "$url" 'Local endpoint'
  case "$url" in http://*) ;; *) fail 'Local endpoint must use http://' ;; esac
  authority="${url#*://}"; authority="${authority%%/*}"
  case "$authority" in
    \[*\]:*) host="${authority%%]*}]"; host="${host#\[}"; host="${host%]}"; port="${authority##*]:}" ;;
    \[*\]) host="${authority#\[}"; host="${host%]}"; port="" ;;
    *:*) host="${authority%%:*}"; port="${authority##*:}" ;;
    *) host="$authority"; port="" ;;
  esac
  case "$host" in 127.0.0.1|localhost|::1) ;; *) fail 'Local endpoint host must be loopback' ;; esac
  [ -n "$port" ] || port=8763
  printf '%s\n%s\n' "$host" "$port"
}
if [ "$CONFIG_ONLY" = true ]; then
  [ -n "$PROFILE" ] || fail '--config-only requires --profile <id>'
  [ -n "$MODE" ] || fail '--config-only requires --mode <backend>'
  case "$MODE" in api|local|ollama|lmstudio|systemone) ;; *) fail "Unknown config-only backend '$MODE'" ;; esac
  [ -z "$AGENT_TARGET" ] || { validate_flag_value "$AGENT_TARGET" 'Agent id'; case "$AGENT_TARGET" in *[!a-z0-9-]*|-*|*-|*--*) fail 'Agent id must contain lowercase letters, digits, and single hyphens only' ;; esac; }
  [ "$ENDPOINT_OVERRIDE_SET" = false ] || validate_endpoint_url "$ENDPOINT_OVERRIDE"
  [ "$MODEL_OVERRIDE_SET" = false ] || { validate_flag_value "$MODEL_OVERRIDE" 'Model id'; case "$MODEL_OVERRIDE" in *[[:space:]]*) fail 'Model id must not contain whitespace' ;; esac; }
  [ "$MODEL_DIR_OVERRIDE_SET" = false ] || validate_flag_value "$MODEL_DIR_OVERRIDE" 'Model directory'
  [ "$KEY_ENV_SET" = false ] || validate_env_name "$KEY_ENV"
  if [ "$KEY_ENV_SET" = true ]; then
    [ "${!KEY_ENV+x}" = x ] || fail "Secret environment variable '$KEY_ENV' is not set"
    CONFIG_SECRET_VALUE="${!KEY_ENV}"
    [ -n "$CONFIG_SECRET_VALUE" ] || fail 'Secret environment variable is empty'
    validate_flag_value "$CONFIG_SECRET_VALUE" 'Secret value'
  else
    CONFIG_SECRET_VALUE=""
  fi
  [ "$MODEL_DIR_OVERRIDE_SET" = false ] || [ "$MODE" = local ] || fail '--model-dir is only valid with local backend'
  if [ "$MODE" = local ] && [ "$ENDPOINT_OVERRIDE_SET" = true ]; then validate_local_endpoint "$ENDPOINT_OVERRIDE" >/dev/null; fi
  if [ "$MODE" = local ] && [ "$MODEL_OVERRIDE_SET" = true ] && [ "$MODEL_OVERRIDE" != 'jev-9b-local' ]; then fail 'Local model id must be jev-9b-local'; fi
 fi
if [ -n "$PROFILE" ]; then
  case "$PROFILE" in *[!a-z0-9-]*|-*|*-|*--*) fail 'Profile id must contain lowercase letters, digits, and single hyphens only' ;; esac
  PROFILE_DIR="$JEV_HOME/profiles"
  PROFILE_CONFIG="$PROFILE_DIR/$PROFILE.env"
else
  PROFILE_DIR=""
  PROFILE_CONFIG="$JEV_HOME/.env"
fi
if [ -n "$PROFILE" ] && [ "$MODE_CLI_SET" = false ] && [ -f "$PROFILE_CONFIG" ]; then
  saved_mode="$(awk -F= '$1 == "JEV_MODE" { value = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); print value; exit }' "$PROFILE_CONFIG")"
  [ -z "$saved_mode" ] || MODE="$saved_mode"
fi

if [ "$ACTION" = status ]; then
  command -v node >/dev/null 2>&1 || fail 'Node.js is required to read Jev status'
  HARNESS="$JEV_HOME/jev-harness.mjs"
  [ -f "$HARNESS" ] || HARNESS="$SCRIPT_DIR/jev-harness.mjs"
  [ -f "$HARNESS" ] || fail 'Jev harness not found; run setup first'
  if [ -n "$PROFILE" ]; then node "$HARNESS" --profile "$PROFILE" status; else node "$HARNESS" status; fi
  exit $?
fi

set_profile_enabled() {
  local enabled="$1" temp
  for destination in "$HOME/.agents" "$JEV_HOME" "$PROFILE_DIR" "$PROFILE_CONFIG"; do
    [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
  done
  mkdir -p "$PROFILE_DIR"
  [ ! -d "$PROFILE_CONFIG" ] || fail "Profile config is a directory: $PROFILE_CONFIG"
  if [ "$enabled" = true ] && [ ! -f "$PROFILE_CONFIG" ]; then
    fail "No profile config exists for '$PROFILE'; configure a backend before enabling it"
  fi
  umask 177
  temp="$(mktemp "$PROFILE_DIR/.$PROFILE.env.XXXXXX")" || fail 'Cannot create profile config temporary file'
  if [ -f "$PROFILE_CONFIG" ]; then
    awk -v enabled="$enabled" 'BEGIN { seen = 0 } /^[[:space:]]*JEV_ENABLED[[:space:]]*=/ { if (!seen) print "JEV_ENABLED=" enabled; seen = 1; next } { print } END { if (!seen) print "JEV_ENABLED=" enabled }' "$PROFILE_CONFIG" > "$temp"
  else
    printf 'JEV_ENABLED=false\n' > "$temp"
  fi
  if ! chmod 600 "$temp" || ! mv -f "$temp" "$PROFILE_CONFIG"; then
    rm -f "$temp"
    fail 'Cannot update Jev profile toggle'
  fi
}

if [ "$ACTION" = enable ] || [ "$ACTION" = disable ]; then
  [ -n "$PROFILE" ] || fail "--$ACTION requires --profile <id>"
  if [ "$ACTION" = enable ]; then set_profile_enabled true; info "Profile '$PROFILE' enabled; verify with jev-setup.sh --profile $PROFILE --status."
  else set_profile_enabled false; info "Profile '$PROFILE' disabled; its backend settings and credentials were retained."
  fi
  exit 0
fi

load_profile_defaults() {
  local file="$1" line key value wanted
  if [ "$KEY_ENV_SET" = false ] && [ -n "$PROFILE" ] && [ -f "$PROFILE_CONFIG" ] && [ -f "$file" ]; then
    case "$MODE" in
      api) wanted=JEV_API_KEY ;;
      systemone) wanted=JEV_SYSTEMONE_API_KEY ;;
      *) wanted="" ;;
    esac
    if [ -n "$wanted" ] && ! awk -F= -v wanted="$wanted" '{ lhs = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", lhs); if (lhs == wanted) found = 1 } END { exit found ? 0 : 1 }' "$file" 2>/dev/null; then
      printf -v "$wanted" '%s' ''
      export "$wanted"
    fi
  fi
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*(JEV_[A-Z_]+)[[:space:]]*=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    case "$value" in "\""*"\"") value="${value#\"}"; value="${value%\"}" ;; "'"*"'") value="${value#\'}"; value="${value%\'}" ;; esac
    case "$key" in
      JEV_*_ENDPOINT|JEV_ENDPOINT) [ "$ENDPOINT_OVERRIDE_SET" = false ] || continue ;;
      JEV_*_MODEL|JEV_MODEL) [ "$MODEL_OVERRIDE_SET" = false ] || continue ;;
      JEV_*_KEY) [ "$KEY_ENV_SET" = false ] || continue ;;
    esac
    printf -v "$key" '%s' "$value"; export "$key"
  done < "$file"
}

if [ -z "$MODE" ]; then
  if [ ! -t 0 ]; then info 'No TTY and JEO_SKILLS_JEV unset — skipping optional Jev setup.'; exit 0; fi
  printf '\n%s╭──────────────────────────────────────────────────────╮%s\n' "$bold" "$reset"
  printf '%s│  Jev control plane (optional)                        │%s\n' "$bold" "$reset"
  printf '%s╰──────────────────────────────────────────────────────╯%s\n' "$bold" "$reset"
  printf '%sSkill routing, context pruning, and a review gate for the jeo runtime.%s\n' "$dim" "$reset"
  printf 'Install the Jev control plane? [y/N] '
  read -r yn
  case "$yn" in y|Y|yes|YES) ;; *) info 'Skipped. Re-run jev-setup.sh any time to enable it.'; exit 0 ;; esac
  printf '\nBackend mode:\n'
  printf '  %s1)%s API      — hosted TypeSafe System One (needs a JEV API key, paid)\n' "$bold" "$reset"
  printf '  %s2)%s Local    — full-precision autotrust/JEV-9B via transformers (~18 GB\n' "$bold" "$reset"
  printf '              download, needs ~18 GB RAM, runs offline)\n'
  printf '  %s3)%s Ollama   — quantized JEV-9B GGUF Q4_K_M (~5.6 GB download, ~6 GB RAM,\n' "$bold" "$reset"
  printf '              runs offline; recommended on 16 GB machines)\n'
  if [ "$(uname -s)" = Darwin ]; then
    printf '  %s4)%s LMStudio — same quantized GGUF served by the LM Studio app (macOS)\n' "$bold" "$reset"
    printf '  %s5)%s System One — operator-provided endpoint (no download or server start)\n' "$bold" "$reset"
    printf 'Select [1/2/3/4/5]: '
  else
    printf '  %s4)%s System One — operator-provided endpoint (no download or server start)\n' "$bold" "$reset"
    printf 'Select [1/2/3/4]: '
  fi
  read -r pick
  if [ "$(uname -s)" = Darwin ]; then
    case "$pick" in 1) MODE=api ;; 2) MODE=local ;; 3) MODE=ollama ;; 4) MODE=lmstudio ;; 5) MODE=systemone ;; *) fail 'Pick a listed number' ;; esac
  else
    case "$pick" in 1) MODE=api ;; 2) MODE=local ;; 3) MODE=ollama ;; 4) MODE=systemone ;; *) fail 'Pick a listed number' ;; esac
  fi
fi
case "$MODE" in skip) info 'JEO_SKILLS_JEV=skip — not installing Jev.'; exit 0 ;; api|local|ollama|lmstudio|systemone) ;; *) fail "JEO_SKILLS_JEV must be skip, api, local, ollama, lmstudio, or systemone (got '$MODE')" ;; esac
export JEV_MODE="$MODE"
if [ -n "$PROFILE" ] && [ "$CONFIG_ONLY" != true ]; then
  load_profile_defaults "$PROFILE_DIR/$PROFILE.$MODE.env"
fi
if [ "$CONFIG_ONLY" != true ]; then
  if [ "$KEY_ENV_SET" = true ]; then
    validate_env_name "$KEY_ENV"
    [ "${!KEY_ENV+x}" = x ] || fail "Secret environment variable '$KEY_ENV' is not set"
    EXPLICIT_KEY="${!KEY_ENV}"
    [ -n "$EXPLICIT_KEY" ] || fail 'Secret environment variable is empty'
    validate_flag_value "$EXPLICIT_KEY" 'Secret value'
    case "$MODE" in
      api) JEV_API_KEY="$EXPLICIT_KEY"; export JEV_API_KEY ;;
      systemone) JEV_SYSTEMONE_API_KEY="$EXPLICIT_KEY"; export JEV_SYSTEMONE_API_KEY ;;
    esac
  fi
  if [ "$ENDPOINT_OVERRIDE_SET" = true ]; then
    if [ "$MODE" = local ]; then validate_local_endpoint "$ENDPOINT_OVERRIDE" >/dev/null; else validate_endpoint_url "$ENDPOINT_OVERRIDE"; fi
    case "$MODE" in
      api) JEV_API_ENDPOINT="$ENDPOINT_OVERRIDE"; JEV_ENDPOINT="$ENDPOINT_OVERRIDE" ;;
      local) JEV_LOCAL_ENDPOINT="$ENDPOINT_OVERRIDE"; JEV_ENDPOINT="$ENDPOINT_OVERRIDE" ;;
      ollama) JEV_OLLAMA_ENDPOINT="$ENDPOINT_OVERRIDE"; JEV_ENDPOINT="$ENDPOINT_OVERRIDE" ;;
      lmstudio) JEV_LMSTUDIO_ENDPOINT="$ENDPOINT_OVERRIDE"; JEV_ENDPOINT="$ENDPOINT_OVERRIDE" ;;
      systemone) JEV_SYSTEMONE_ENDPOINT="$ENDPOINT_OVERRIDE"; export JEV_SYSTEMONE_ENDPOINT ;;
    esac
  fi
  if [ "$MODEL_OVERRIDE_SET" = true ]; then
    validate_flag_value "$MODEL_OVERRIDE" 'Model id'
    case "$MODEL_OVERRIDE" in *[[:space:]]*) fail 'Model id must not contain whitespace' ;; esac
    if [ "$MODE" = local ] && [ "$MODEL_OVERRIDE" != 'jev-9b-local' ]; then fail 'Local model id must be jev-9b-local'; fi
    case "$MODE" in
      api) JEV_API_MODEL="$MODEL_OVERRIDE" ;;
      local) JEV_LOCAL_MODEL="$MODEL_OVERRIDE" ;;
      ollama|lmstudio) JEV_LOCAL_MODEL="$MODEL_OVERRIDE" ;;
      systemone) JEV_SYSTEMONE_MODEL="$MODEL_OVERRIDE"; export JEV_SYSTEMONE_MODEL ;;
    esac
  fi
fi
MODEL_REPO="autotrust/JEV-9B"
if [ "$CONFIG_ONLY" = true ]; then MODEL_DIR="${MODEL_DIR_OVERRIDE:-$JEV_HOME/models/JEV-9B}"; else MODEL_DIR="${JEV_LOCAL_MODEL_DIR:-$JEV_HOME/models/JEV-9B}"; fi
PROFILE_MODE_CONFIG="${PROFILE_DIR:+$PROFILE_DIR/$PROFILE.$MODE.env}"
if [ "$CONFIG_ONLY" != true ] && [ "$MODE" = api ]; then
  KEY="${JEV_API_KEY:-}"
  if [ -z "$KEY" ]; then
    [ -t 0 ] || fail 'api mode without TTY requires JEV_API_KEY in the environment'
    printf 'Enter your JEV API key (input hidden): '
    read -rs KEY; printf '\n'
  fi
  [ -n "$KEY" ] || fail 'Empty API key'
fi
if [ "$CONFIG_ONLY" != true ] && [ "$MODE" = systemone ]; then
  SYSTEMONE_ENDPOINT="${JEV_SYSTEMONE_ENDPOINT:-}"
  SYSTEMONE_DRIVER="${JEV_SYSTEMONE_DRIVER:-typesafe}"
  SYSTEMONE_MODEL="${JEV_SYSTEMONE_MODEL:-}"
  SYSTEMONE_API_KEY="${JEV_SYSTEMONE_API_KEY:-}"
  SYSTEMONE_HEAD_JSON="${JEV_SYSTEMONE_HEAD_JSON:-}"
  SYSTEMONE_CALIBRATION_JSON="${JEV_SYSTEMONE_CALIBRATION_JSON:-}"
  SYSTEMONE_CHOICE_CAP="${JEV_SYSTEMONE_CHOICE_CAP:-}"
  if [ -z "$SYSTEMONE_ENDPOINT" ]; then
    [ -t 0 ] || fail 'systemone mode without TTY requires JEV_SYSTEMONE_ENDPOINT in the environment'
    printf 'Enter the System One endpoint: '
    read -r SYSTEMONE_ENDPOINT
  fi
  [ -n "$SYSTEMONE_ENDPOINT" ] || fail 'Empty System One endpoint'
  if [ -z "$SYSTEMONE_MODEL" ]; then
    [ -t 0 ] || fail 'systemone mode without TTY requires JEV_SYSTEMONE_MODEL in the environment'
    printf 'Enter the System One model id: '
    read -r SYSTEMONE_MODEL
  fi
  [ -n "$SYSTEMONE_MODEL" ] || fail 'Empty System One model id'
  case "$SYSTEMONE_DRIVER" in typesafe|decide|vllm-jev-decision) ;; *) fail 'JEV_SYSTEMONE_DRIVER must be typesafe, decide, or vllm-jev-decision' ;; esac
  if [ -t 0 ] && [ -z "$SYSTEMONE_API_KEY" ]; then
    printf 'Enter the optional System One API key (input hidden; press Enter to skip): '
    read -rs SYSTEMONE_API_KEY; printf '\n'
  fi
  if [ -t 0 ] && [ -z "$SYSTEMONE_HEAD_JSON" ]; then
    printf 'Enter optional head JSON path (press Enter to skip): '
    read -r SYSTEMONE_HEAD_JSON
  fi
  if [ -t 0 ] && [ -z "$SYSTEMONE_CALIBRATION_JSON" ]; then
    printf 'Enter optional calibration JSON path (press Enter to skip): '
    read -r SYSTEMONE_CALIBRATION_JSON
  fi
fi
for value in "${KEY:-}" "${JEV_ENDPOINT:-}" "${JEV_API_ENDPOINT:-}" "${JEV_LOCAL_ENDPOINT:-}" "${JEV_OLLAMA_ENDPOINT:-}" "${JEV_LMSTUDIO_ENDPOINT:-}" "${JEV_LOCAL_MODEL:-}" "${SYSTEMONE_ENDPOINT:-}" "${SYSTEMONE_DRIVER:-}" "${SYSTEMONE_MODEL:-}" "${SYSTEMONE_API_KEY:-}" "${SYSTEMONE_HEAD_JSON:-}" "${SYSTEMONE_CALIBRATION_JSON:-}" "${SYSTEMONE_CHOICE_CAP:-}" "${VALIDATED_MODEL:-}" "$ROUTE_BACKEND" "$PRUNE_BACKEND" "$REVIEW_BACKEND" "$ROUTE_FALLBACK" "$PRUNE_FALLBACK" "$REVIEW_FALLBACK" "$MODEL_DIR"; do
  case "$value" in *$'\n'*|*$'\r'*) fail 'Jev configuration values must be single-line' ;; esac
done
command -v node >/dev/null 2>&1 || fail 'Node.js is required for the Jev harness'
CONFIG_DESTINATIONS=("$HOME/.agents" "$JEV_HOME" "$JEV_HOME/plugins" "$RULES_DIR" "$RULES_DIR/jev-control-plane.md" "$JEV_HOME/skills.json")
if [ -n "$PROFILE" ]; then CONFIG_DESTINATIONS+=("$PROFILE_DIR" "$PROFILE_CONFIG" "$PROFILE_MODE_CONFIG")
else CONFIG_DESTINATIONS+=("$JEV_HOME/.env")
fi
for destination in "${CONFIG_DESTINATIONS[@]}"; do
  [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
done
[ ! -e "$HOME/.agents" ] || [ -d "$HOME/.agents" ] || fail "Refusing non-directory destination: $HOME/.agents"
[ ! -e "$JEV_HOME" ] || [ -d "$JEV_HOME" ] || fail "Refusing non-directory destination: $JEV_HOME"
[ ! -e "$RULES_DIR" ] || [ -d "$RULES_DIR" ] || fail "Refusing non-directory destination: $RULES_DIR"
for f in "${FILES[@]}" jev-plugin.mjs; do
  [ ! -L "$JEV_HOME/$f" ] || fail "Refusing symlink destination: $JEV_HOME/$f"
  [ ! -e "$JEV_HOME/$f" ] || [ -f "$JEV_HOME/$f" ] || fail "Refusing non-file destination: $JEV_HOME/$f"
done
if [ "$MODE" = local ]; then
  for destination in "$JEV_HOME/venv" "$JEV_HOME/venv/bin" "$JEV_HOME/models" "$MODEL_DIR"; do
    [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
  done
  destination="$MODEL_DIR"
  while [[ "$destination" == "$HOME/"* ]]; do
    [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
    destination="$(dirname "$destination")"
  done
fi

native_destination_guard() {
  [ ! -L "$JEV_HOME/plugins" ] || fail "Refusing symlink destination: $JEV_HOME/plugins"
  [ ! -e "$JEV_HOME/plugins" ] || [ -d "$JEV_HOME/plugins" ] || fail "Refusing non-directory destination: $JEV_HOME/plugins"
  if [ -d "$JEV_HOME/plugins" ]; then
    [ -z "$(find "$JEV_HOME/plugins" -type l -print -quit)" ] || fail "Refusing nested symlink in destination: $JEV_HOME/plugins"
  fi
}

native_parent_guard() {
  local destination parent
  destination="$1"
  parent="$(dirname "$destination")"
  while [ "$parent" != "$JEV_HOME" ] && [ "$parent" != "/" ]; do
    [ ! -e "$parent" ] || [ -d "$parent" ] || fail "Refusing non-directory destination parent: $parent"
    parent="$(dirname "$parent")"
  done
}

native_collision_guard() {
  local source_path relative destination
  while IFS= read -r -d '' source_path; do
    relative="${source_path#"$NATIVE_PLUGIN_DIR/"}"
    destination="$JEV_HOME/plugins/$relative"
    native_parent_guard "$destination"
    if [ -d "$source_path" ]; then
      [ ! -e "$destination" ] || [ -d "$destination" ] || fail "Refusing non-directory native collision: $destination"
    else
      [ ! -e "$destination" ] || [ -f "$destination" ] || fail "Refusing non-file native collision: $destination"
    fi
  done < <(find "$NATIVE_PLUGIN_DIR" -mindepth 1 -print0)
}

native_preflight() {
  if [ "$STANDALONE_SETUP" = true ] && [ ! -d "$NATIVE_PLUGIN_DIR" ] && [ "$CONFIG_ONLY" != true ]; then
    native_destination_guard
    for native_file in "${NATIVE_PLUGIN_FILES[@]}"; do
      native_destination="$JEV_HOME/$native_file"
      [ ! -L "$native_destination" ] || fail "Refusing symlink destination: $native_destination"
      native_parent_guard "$native_destination"
      [ ! -e "$native_destination" ] || [ -f "$native_destination" ] || fail "Refusing non-file native collision: $native_destination"
    done
  fi
  if [ -e "$NATIVE_PLUGIN_DIR" ] || [ -L "$NATIVE_PLUGIN_DIR" ]; then
    [ -d "$NATIVE_PLUGIN_DIR" ] || fail "Refusing non-directory native plugin source: $NATIVE_PLUGIN_DIR"
    [ ! -L "$NATIVE_PLUGIN_DIR" ] || fail "Refusing symlink native plugin source: $NATIVE_PLUGIN_DIR"
    native_destination_guard
    [ -z "$(find "$NATIVE_PLUGIN_DIR" -type l -print -quit)" ] || fail "Refusing symlink in native plugin source: $NATIVE_PLUGIN_DIR"
    native_collision_guard
  fi
}

native_preflight
SETUP_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/jev-setup.XXXXXX")" || fail 'Cannot create Jev setup staging directory'
trap 'rm -rf "$SETUP_STAGE"' EXIT
mkdir -p "$SETUP_STAGE/files"
PUBLISH_FILES=()
PUBLISH_NATIVE=false
PUBLISH_CATALOG=false

# ── Stage managed runtime assets before publishing any installed bytes ────────
for f in "${FILES[@]}"; do
  staged="$SETUP_STAGE/files/$f"
  source="$SCRIPT_DIR/$f"
  mkdir -p "$(dirname "$staged")"
  if [ -f "$source" ]; then
    cp "$source" "$staged"
    if [ ! -f "$JEV_HOME/$f" ] || [ ! "$source" -ef "$JEV_HOME/$f" ]; then PUBLISH_FILES+=("$f"); fi
  elif [ "$CONFIG_ONLY" = true ] && [ -f "$JEV_HOME/$f" ]; then
    cp "$JEV_HOME/$f" "$staged"
  elif [ "$CONFIG_ONLY" = true ]; then
    fail "Cannot install $f in config-only mode: no local copy"
  else
    curl -fsSL "$RAW_BASE/$f" -o "$staged" || fail "Cannot fetch $f (no local copy, download failed)"
    PUBLISH_FILES+=("$f")
  fi
done
if [ "$STANDALONE_SETUP" = true ] && [ ! -f "$SCRIPT_DIR/jev-plugin.mjs" ] && [ "$CONFIG_ONLY" != true ]; then
  curl -fsSL "$RAW_BASE/jev-plugin.mjs" -o "$SETUP_STAGE/files/jev-plugin.mjs" || fail 'Cannot fetch jev-plugin.mjs (no local copy, download failed)'
  PUBLISH_FILES+=(jev-plugin.mjs)
fi

if [ "$STANDALONE_SETUP" = true ] && [ ! -d "$NATIVE_PLUGIN_DIR" ] && [ "$CONFIG_ONLY" != true ]; then
  for native_file in "${NATIVE_PLUGIN_FILES[@]}"; do
    staged="$SETUP_STAGE/$native_file"
    mkdir -p "$(dirname "$staged")"
    curl -fsSL "$RAW_BASE/$native_file" -o "$staged" || fail "Cannot fetch $native_file (no local copy, download failed)"
  done
  PUBLISH_NATIVE=true
elif [ -d "$NATIVE_PLUGIN_DIR" ]; then
  mkdir -p "$SETUP_STAGE/plugins"
  cp -R "$NATIVE_PLUGIN_DIR/." "$SETUP_STAGE/plugins/"
  if [ ! -d "$JEV_HOME/plugins" ] || [ ! "$NATIVE_PLUGIN_DIR" -ef "$JEV_HOME/plugins" ]; then PUBLISH_NATIVE=true; fi
fi

# The catalog is staged and validated before any replacement is published.
CATALOG_SOURCE="${JEO_SKILLS_CATALOG:-$SCRIPT_DIR/../.agent-skills/skills.json}"
catalog_is_valid() {
  local candidate="$1"
  [ -f "$candidate" ] || return 1
  node -e 'const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.exit(Array.isArray(c.skills) && c.skills.length && c.categories && typeof c.categories === "object" ? 0 : 1)' "$candidate" 2>/dev/null
}
catalog_keep_existing_or_warn() {
  local reason="$1"
  if catalog_is_valid "$JEV_HOME/skills.json"; then
    info "$reason; keeping the existing one."
  else
    info "$reason; no valid installed skills catalog remains, continuing without a snapshot."
  fi
}
if [ -f "$CATALOG_SOURCE" ]; then
  if [ "$CATALOG_SOURCE" -ef "$JEV_HOME/skills.json" ]; then
    if catalog_is_valid "$JEV_HOME/skills.json"; then
      :
    else
      info 'Configured skills catalog source is invalid; continuing without a catalog snapshot.'
    fi
  elif cp "$CATALOG_SOURCE" "$SETUP_STAGE/skills.json" && catalog_is_valid "$SETUP_STAGE/skills.json"; then
    PUBLISH_CATALOG=true
  else
    rm -f "$SETUP_STAGE/skills.json"
    catalog_keep_existing_or_warn 'Could not refresh the skills catalog snapshot'
  fi
elif [ "$CONFIG_ONLY" = true ]; then
  if [ -f "$JEV_HOME/skills.json" ] && ! catalog_is_valid "$JEV_HOME/skills.json"; then
    info 'Existing skills catalog snapshot is invalid; continuing without a snapshot.'
  fi
elif curl -fsSL "${RAW_BASE%/jev}/.agent-skills/skills.json" -o "$SETUP_STAGE/skills.json" 2>/dev/null && catalog_is_valid "$SETUP_STAGE/skills.json"; then
  PUBLISH_CATALOG=true
else
  rm -f "$SETUP_STAGE/skills.json"
  catalog_keep_existing_or_warn 'Could not refresh the skills catalog snapshot'
fi

# Every staged Node module is checked before anything is published: a broken plugin or
# native controller would crash every host hook that loads it.
while IFS= read -r -d '' staged_module; do
  node --check "$staged_module" >/dev/null || fail "Syntax check failed for staged ${staged_module#"$SETUP_STAGE/"}"
done < <(find "$SETUP_STAGE" -name '*.mjs' -type f -print0)
mkdir -p "$JEV_HOME" "$RULES_DIR"
if [ -n "$PROFILE" ]; then mkdir -p "$PROFILE_DIR"; fi
for f in "${PUBLISH_FILES[@]}"; do
  destination="$JEV_HOME/$f"
  mkdir -p "$(dirname "$destination")"
  cp "$SETUP_STAGE/files/$f" "$destination"
done
if [ "$PUBLISH_NATIVE" = true ]; then
  mkdir -p "$JEV_HOME/plugins"
  cp -R "$SETUP_STAGE/plugins/." "$JEV_HOME/plugins/"
fi
if [ "$PUBLISH_CATALOG" = true ]; then
  cp "$SETUP_STAGE/skills.json" "$JEV_HOME/skills.json"
  info "Skills catalog snapshot installed at $JEV_HOME/skills.json"
elif [ -f "$JEV_HOME/skills.json" ]; then
  info 'Skills catalog snapshot retained'
else
  info 'No skills catalog snapshot: route-skills needs JEV_CATALOG_PATH or a jeo-skills checkout until setup is re-run online.'
fi
cp "$JEV_HOME/jev-control-plane.rule.md" "$RULES_DIR/jev-control-plane.md"
node --check "$JEV_HOME/jev-harness.mjs" >/dev/null || fail 'Harness syntax check failed'
info "Harness installed at $JEV_HOME (syntax check passed; no backend inference performed)"


write_env_file() { # write_env_file <path>; KEY=VALUE lines on stdin
  local destination="$1" directory env_tmp
  directory="$(dirname "$destination")"
  [ ! -d "$destination" ] || fail "Configuration destination is a directory: $destination"
  [ ! -L "$destination" ] || fail "Refusing symlink destination: $destination"
  mkdir -p "$directory"
  umask 177
  env_tmp="$(mktemp "$directory/.$(basename "$destination").XXXXXX")" || fail 'Cannot create Jev configuration temporary file'
  if ! cat > "$env_tmp" || ! chmod 600 "$env_tmp" || ! mv -f "$env_tmp" "$destination"; then
    rm -f "$env_tmp"
    fail "Cannot replace Jev configuration: $destination"
  fi
}
write_env() {
  if [ -z "$ROUTE_BACKEND$PRUNE_BACKEND$REVIEW_BACKEND$ROUTE_FALLBACK$PRUNE_FALLBACK$REVIEW_FALLBACK$VALIDATED_MODEL" ]; then
    write_env_file "$JEV_HOME/.env"
    return
  fi
  {
    cat
    [ -z "$VALIDATED_MODEL" ] || printf '%s=%s\n' "$VALIDATED_KEY" "$VALIDATED_MODEL"
    [ -z "$ROUTE_BACKEND" ] || printf 'JEV_ROUTE_SKILLS_BACKEND=%s\n' "$ROUTE_BACKEND"
    [ -z "$PRUNE_BACKEND" ] || printf 'JEV_PRUNE_CONTEXT_BACKEND=%s\n' "$PRUNE_BACKEND"
    [ -z "$REVIEW_BACKEND" ] || printf 'JEV_REVIEW_BACKEND=%s\n' "$REVIEW_BACKEND"
    [ -z "$ROUTE_FALLBACK" ] || printf 'JEV_ROUTE_SKILLS_FALLBACK=%s\n' "$ROUTE_FALLBACK"
    [ -z "$PRUNE_FALLBACK" ] || printf 'JEV_PRUNE_CONTEXT_FALLBACK=%s\n' "$PRUNE_FALLBACK"
    [ -z "$REVIEW_FALLBACK" ] || printf 'JEV_REVIEW_FALLBACK=%s\n' "$REVIEW_FALLBACK"
  } | write_env_file "$JEV_HOME/.env"
}
write_profile_base() {
  local enabled stored temp
  if [ -f "$PROFILE_CONFIG" ]; then
    stored="$(awk -F= '/^[[:space:]]*JEV_ENABLED[[:space:]]*=/ { value = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", value) } END { print tolower(value) }' "$PROFILE_CONFIG")"
    case "$stored" in ''|true) enabled=true ;; false) enabled=false ;; *) fail 'Invalid JEV_ENABLED value in existing profile' ;; esac
  elif [ "$CONFIG_ONLY" = true ]; then
    enabled=false
  else
    enabled=true
  fi
  umask 177
  temp="$(mktemp "$PROFILE_DIR/.$PROFILE.env.XXXXXX")" || fail 'Cannot create profile config temporary file'
  {
    printf 'JEV_ENABLED=%s\nJEV_MODE=%s\n' "$enabled" "$MODE"
    if [ -f "$PROFILE_CONFIG" ]; then
      awk -v route="$ROUTE_BACKEND" -v prune="$PRUNE_BACKEND" -v review="$REVIEW_BACKEND" -v route_fallback="$ROUTE_FALLBACK" -v prune_fallback="$PRUNE_FALLBACK" -v review_fallback="$REVIEW_FALLBACK" '
        /^[[:space:]]*JEV_ENABLED[[:space:]]*=/ { next }
        /^[[:space:]]*JEV_MODE[[:space:]]*=/ { next }
        /^[[:space:]]*JEV_ROUTE_SKILLS_BACKEND[[:space:]]*=/ && route != "" { next }
        /^[[:space:]]*JEV_PRUNE_CONTEXT_BACKEND[[:space:]]*=/ && prune != "" { next }
        /^[[:space:]]*JEV_REVIEW_BACKEND[[:space:]]*=/ && review != "" { next }
        /^[[:space:]]*JEV_ROUTE_SKILLS_FALLBACK[[:space:]]*=/ && route_fallback != "" { next }
        /^[[:space:]]*JEV_PRUNE_CONTEXT_FALLBACK[[:space:]]*=/ && prune_fallback != "" { next }
        /^[[:space:]]*JEV_REVIEW_FALLBACK[[:space:]]*=/ && review_fallback != "" { next }
        { print }
      ' "$PROFILE_CONFIG"
    fi
    [ -z "$ROUTE_BACKEND" ] || printf 'JEV_ROUTE_SKILLS_BACKEND=%s\n' "$ROUTE_BACKEND"
    [ -z "$PRUNE_BACKEND" ] || printf 'JEV_PRUNE_CONTEXT_BACKEND=%s\n' "$PRUNE_BACKEND"
    [ -z "$REVIEW_BACKEND" ] || printf 'JEV_REVIEW_BACKEND=%s\n' "$REVIEW_BACKEND"
    [ -z "$ROUTE_FALLBACK" ] || printf 'JEV_ROUTE_SKILLS_FALLBACK=%s\n' "$ROUTE_FALLBACK"
    [ -z "$PRUNE_FALLBACK" ] || printf 'JEV_PRUNE_CONTEXT_FALLBACK=%s\n' "$PRUNE_FALLBACK"
    [ -z "$REVIEW_FALLBACK" ] || printf 'JEV_REVIEW_FALLBACK=%s\n' "$REVIEW_FALLBACK"
  } > "$temp"
  if ! chmod 600 "$temp" || ! mv -f "$temp" "$PROFILE_CONFIG"; then
    rm -f "$temp"
    fail 'Cannot update Jev profile base'
  fi
}
case "$MODE" in
  api) VALIDATED_KEY=JEV_API_VALIDATED_MODEL ;;
  local) VALIDATED_KEY=JEV_LOCAL_VALIDATED_MODEL ;;
  ollama) VALIDATED_KEY=JEV_OLLAMA_VALIDATED_MODEL ;;
  lmstudio) VALIDATED_KEY=JEV_LMSTUDIO_VALIDATED_MODEL ;;
  systemone) VALIDATED_KEY=JEV_SYSTEMONE_VALIDATED_MODEL ;;
esac
write_selected_config() {
  if [ -n "$PROFILE" ]; then
    local payload
    umask 177
    payload="$(mktemp "$SETUP_STAGE/profile-payload.XXXXXX")" || fail 'Cannot create profile config temporary file'
    if ! cat > "$payload"; then fail 'Cannot read Jev backend profile input'; fi
    [ -z "$VALIDATED_MODEL" ] || printf '%s=%s\n' "$VALIDATED_KEY" "$VALIDATED_MODEL" >> "$payload"
    write_config_only_selected < "$payload"
    rm -f "$payload"
  else
    write_env
  fi
}

profile_value() {
  local key="$1"
  [ -f "$PROFILE_MODE_CONFIG" ] || return 0
  awk -v key="$key" 'index($0, "=") > 0 { lhs = substr($0, 1, index($0, "=") - 1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", lhs); if (lhs == key) { value = substr($0, index($0, "=") + 1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); print value; exit } }' "$PROFILE_MODE_CONFIG"
}
write_config_only_selected() {
  local updates merged
  umask 177
  updates="$(mktemp "$SETUP_STAGE/profile-update.XXXXXX")" || fail 'Cannot create profile config temporary file'
  cat > "$updates" || { rm -f "$updates"; fail 'Cannot read Jev config-only profile input'; }
  if [ -f "$PROFILE_MODE_CONFIG" ]; then
    merged="$(mktemp "$SETUP_STAGE/profile-merge.XXXXXX")" || { rm -f "$updates"; fail 'Cannot create profile merge temporary file'; }
    awk -F= 'NR == FNR { key = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); replace[key] = 1; next } { key = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); if (!(key in replace)) print }' "$updates" "$PROFILE_MODE_CONFIG" > "$merged"
    cat "$updates" >> "$merged"
    write_env_file "$PROFILE_MODE_CONFIG" < "$merged"
    rm -f "$merged"
  else
    write_env_file "$PROFILE_MODE_CONFIG" < "$updates"
  fi
  rm -f "$updates"
  write_profile_base
}
if [ "$CONFIG_ONLY" = true ]; then
  SECRET_VALUE=""
  if [ "$KEY_ENV_SET" = true ]; then
    [ "${!KEY_ENV+x}" = x ] || fail "Secret environment variable '$KEY_ENV' is not set"
    SECRET_VALUE="${!KEY_ENV}"
    [ -n "$SECRET_VALUE" ] || fail 'Secret environment variable is empty'
    validate_flag_value "$SECRET_VALUE" 'Secret value'
  fi
  endpoint=""; model=""
  case "$MODE" in
    api)
      endpoint="${ENDPOINT_OVERRIDE:-$(profile_value JEV_API_ENDPOINT)}"; [ -n "$endpoint" ] || endpoint='https://api.typesafe.ai/v1/systemone'
      validate_endpoint_url "$endpoint" 'API endpoint'
      model="${MODEL_OVERRIDE:-$(profile_value JEV_API_MODEL)}"; [ -n "$model" ] || model='jev-latest'
      { printf 'JEV_API_ENDPOINT=%s\nJEV_API_MODEL=%s\n' "$endpoint" "$model"; [ "$KEY_ENV_SET" = true ] && printf 'JEV_API_KEY=%s\n' "$SECRET_VALUE" || :; } | write_config_only_selected
      ;;
    local)
      [ "$MODEL_DIR_OVERRIDE_SET" = false ] || :
      endpoint="${ENDPOINT_OVERRIDE:-$(profile_value JEV_LOCAL_ENDPOINT)}"; [ -n "$endpoint" ] || endpoint='http://127.0.0.1:8763/v1/systemone'
      local_info="$(validate_local_endpoint "$endpoint")"
      local_host="${local_info%%$'\n'*}"; local_port="${local_info#*$'\n'}"
      model="${MODEL_OVERRIDE:-$(profile_value JEV_LOCAL_MODEL)}"; [ -n "$model" ] || model='jev-9b-local'
      [ "$model" = 'jev-9b-local' ] || fail 'Local model id must be jev-9b-local'
      model_dir="${MODEL_DIR_OVERRIDE:-$(profile_value JEV_LOCAL_MODEL_DIR)}"; [ -n "$model_dir" ] || model_dir="$JEV_HOME/models/JEV-9B"
      validate_flag_value "$model_dir" 'Model directory'
      printf 'JEV_LOCAL_ENDPOINT=%s\nJEV_LOCAL_HOST=%s\nJEV_LOCAL_PORT=%s\nJEV_LOCAL_MODEL=%s\nJEV_LOCAL_MODEL_DIR=%s\n' "$endpoint" "$local_host" "$local_port" "$model" "$model_dir" | write_config_only_selected
      ;;
    ollama)
      [ "$MODEL_DIR_OVERRIDE_SET" = false ] || fail '--model-dir is only valid with local backend'
      endpoint="${ENDPOINT_OVERRIDE:-$(profile_value JEV_OLLAMA_ENDPOINT)}"; [ -n "$endpoint" ] || endpoint='http://127.0.0.1:11434'
      validate_endpoint_url "$endpoint" 'Ollama endpoint'
      model="${MODEL_OVERRIDE:-$(profile_value JEV_OLLAMA_MODEL)}"; [ -n "$model" ] || model="$(profile_value JEV_LOCAL_MODEL)"; [ -n "$model" ] || model='hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M'
      printf 'JEV_OLLAMA_ENDPOINT=%s\nJEV_OLLAMA_MODEL=%s\n' "$endpoint" "$model" | write_config_only_selected
      ;;
    lmstudio)
      [ "$MODEL_DIR_OVERRIDE_SET" = false ] || fail '--model-dir is only valid with local backend'
      endpoint="${ENDPOINT_OVERRIDE:-$(profile_value JEV_LMSTUDIO_ENDPOINT)}"; [ -n "$endpoint" ] || endpoint='http://127.0.0.1:1234'
      validate_endpoint_url "$endpoint" 'LM Studio endpoint'
      model="${MODEL_OVERRIDE:-$(profile_value JEV_LMSTUDIO_MODEL)}"; [ -n "$model" ] || model="$(profile_value JEV_LOCAL_MODEL)"
      printf 'JEV_LMSTUDIO_ENDPOINT=%s\nJEV_LMSTUDIO_MODEL=%s\n' "$endpoint" "$model" | write_config_only_selected
      ;;
    systemone)
      [ "$MODEL_DIR_OVERRIDE_SET" = false ] || fail '--model-dir is only valid with local backend'
      endpoint="${ENDPOINT_OVERRIDE:-$(profile_value JEV_SYSTEMONE_ENDPOINT)}"; [ -n "$endpoint" ] || endpoint='https://api.typesafe.ai/v1/systemone'
      validate_endpoint_url "$endpoint" 'System One endpoint'
      model="${MODEL_OVERRIDE:-$(profile_value JEV_SYSTEMONE_MODEL)}"; [ -n "$model" ] || model='jev-latest'
      driver="$(profile_value JEV_SYSTEMONE_DRIVER)"; [ -n "$driver" ] || driver='typesafe'
      case "$driver" in typesafe|decide|vllm-jev-decision) ;; *) fail 'JEV_SYSTEMONE_DRIVER must be typesafe, decide, or vllm-jev-decision' ;; esac
      { printf 'JEV_SYSTEMONE_ENDPOINT=%s\nJEV_SYSTEMONE_DRIVER=%s\nJEV_SYSTEMONE_MODEL=%s\n' "$endpoint" "$driver" "$model"; [ "$KEY_ENV_SET" = true ] && printf 'JEV_SYSTEMONE_API_KEY=%s\n' "$SECRET_VALUE" || :; } | write_config_only_selected
      ;;
  esac
  info "Config-only $MODE profile '$PROFILE' written (disabled by default; no backend activation performed)."
  exit 0
fi
if [ "$MODE" = api ]; then
  if [ -n "$PROFILE" ]; then
    printf 'JEV_API_KEY=%s\nJEV_API_ENDPOINT=%s\nJEV_API_MODEL=%s\n' "$KEY" "${JEV_API_ENDPOINT:-${JEV_ENDPOINT:-https://api.typesafe.ai/v1/systemone}}" "${JEV_API_MODEL:-jev-latest}" | write_selected_config
    info "API mode configured for profile '$PROFILE' (private mode-600 files)."
  else
    printf 'JEV_MODE=api\nJEV_API_KEY=%s\nJEV_ENDPOINT=%s\n' "$KEY" "${JEV_ENDPOINT:-https://api.typesafe.ai/v1/systemone}" | write_env
    info 'API mode configured (~/.agents/jev/.env, mode 600).'
  fi
elif [ "$MODE" = ollama ]; then
  GGUF_MODEL="${JEV_LOCAL_MODEL:-hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M}"
  command -v ollama >/dev/null 2>&1 || fail 'ollama CLI is required for ollama mode (brew install ollama)'
  if ! pgrep -x ollama >/dev/null 2>&1; then
    info 'Starting ollama serve in the background...'
    (nohup ollama serve >/dev/null 2>&1 &) ; sleep 2
  fi
  if ! ollama show "$GGUF_MODEL" >/dev/null 2>&1; then
    info "Pulling $GGUF_MODEL (quantized JEV-9B, ~5.6 GB)..."
    ollama pull "$GGUF_MODEL" || fail 'ollama pull failed'
  fi
  if [ -n "$PROFILE" ]; then
    printf 'JEV_LOCAL_MODEL=%s\nJEV_OLLAMA_ENDPOINT=%s\n' "$GGUF_MODEL" "${JEV_OLLAMA_ENDPOINT:-${JEV_ENDPOINT:-http://127.0.0.1:11434}}" | write_selected_config
  else
    printf 'JEV_MODE=ollama\nJEV_LOCAL_MODEL=%s\nJEV_ENDPOINT=%s\n' "$GGUF_MODEL" "${JEV_ENDPOINT:-http://127.0.0.1:11434}" | write_env
  fi
  info "Ollama mode configured${PROFILE:+ for profile '$PROFILE'} (Q4_K_M quantization, ~6 GB RAM at inference)."
  info 'Note: this is a quantized third-party distillation, not the original hosted model.'
elif [ "$MODE" = lmstudio ]; then
  [ "$(uname -s)" = Darwin ] || info 'Warning: lmstudio mode is intended for macOS.'
  if command -v lms >/dev/null 2>&1; then
    info 'Downloading quantized JEV-9B via LM Studio CLI (Q4_K_M, ~5.6 GB)...'
    lms get mradermacher/JEV-9B-GGUF@q4_k_m --gguf || info 'lms get failed — download JEV-9B-GGUF (Q4_K_M) in the LM Studio UI instead.'
    lms server start >/dev/null 2>&1 || info 'Could not start the LM Studio server — start it manually in Developer → Start Server.'
    lms load mradermacher/JEV-9B-GGUF >/dev/null 2>&1 || info 'Could not auto-load — find the exact model key with lms ls, then run lms load <model_key>.'
  else
    info 'LM Studio CLI (lms) not found. Install LM Studio (https://lmstudio.ai),'
    info 'download mradermacher/JEV-9B-GGUF (Q4_K_M), and start the server (Developer → Start Server).'
  fi
  # Model id is resolved at runtime from /v1/models (set JEV_LOCAL_MODEL to pin it).
  if [ -n "$PROFILE" ]; then
    printf 'JEV_LMSTUDIO_ENDPOINT=%s\nJEV_LOCAL_MODEL=%s\n' "${JEV_LMSTUDIO_ENDPOINT:-${JEV_ENDPOINT:-http://127.0.0.1:1234}}" "${JEV_LOCAL_MODEL:-}" | write_selected_config
  else
    printf 'JEV_MODE=lmstudio\nJEV_ENDPOINT=%s\nJEV_LOCAL_MODEL=%s\n' "${JEV_ENDPOINT:-http://127.0.0.1:1234}" "${JEV_LOCAL_MODEL:-}" | write_env
  fi
  info "LM Studio mode configured${PROFILE:+ for profile '$PROFILE'} (harness auto-detects the loaded model id)."
elif [ "$MODE" = systemone ]; then
  if [ -n "$PROFILE" ]; then
    {
      printf 'JEV_SYSTEMONE_ENDPOINT=%s\nJEV_SYSTEMONE_DRIVER=%s\nJEV_SYSTEMONE_MODEL=%s\n' "$SYSTEMONE_ENDPOINT" "$SYSTEMONE_DRIVER" "$SYSTEMONE_MODEL"
      [ -z "$SYSTEMONE_API_KEY" ] || printf 'JEV_SYSTEMONE_API_KEY=%s\n' "$SYSTEMONE_API_KEY"
      [ -z "$SYSTEMONE_HEAD_JSON" ] || printf 'JEV_SYSTEMONE_HEAD_JSON=%s\n' "$SYSTEMONE_HEAD_JSON"
      [ -z "$SYSTEMONE_CALIBRATION_JSON" ] || printf 'JEV_SYSTEMONE_CALIBRATION_JSON=%s\n' "$SYSTEMONE_CALIBRATION_JSON"
      [ -z "$SYSTEMONE_CHOICE_CAP" ] || printf 'JEV_SYSTEMONE_CHOICE_CAP=%s\n' "$SYSTEMONE_CHOICE_CAP"
    } | write_selected_config
  else
    {
      printf 'JEV_MODE=systemone\nJEV_SYSTEMONE_ENDPOINT=%s\nJEV_SYSTEMONE_DRIVER=%s\nJEV_SYSTEMONE_MODEL=%s\n' "$SYSTEMONE_ENDPOINT" "$SYSTEMONE_DRIVER" "$SYSTEMONE_MODEL"
      [ -z "$SYSTEMONE_API_KEY" ] || printf 'JEV_SYSTEMONE_API_KEY=%s\n' "$SYSTEMONE_API_KEY"
      [ -z "$SYSTEMONE_HEAD_JSON" ] || printf 'JEV_SYSTEMONE_HEAD_JSON=%s\n' "$SYSTEMONE_HEAD_JSON"
      [ -z "$SYSTEMONE_CALIBRATION_JSON" ] || printf 'JEV_SYSTEMONE_CALIBRATION_JSON=%s\n' "$SYSTEMONE_CALIBRATION_JSON"
      [ -z "$SYSTEMONE_CHOICE_CAP" ] || printf 'JEV_SYSTEMONE_CHOICE_CAP=%s\n' "$SYSTEMONE_CHOICE_CAP"
    } | write_env
  fi
  info "System One mode configured${PROFILE:+ for profile '$PROFILE'} (operator endpoint; no downloads or server start)."
else
  PYBIN="$(command -v python3 || true)"; [ -n "$PYBIN" ] || fail 'python3 is required for local mode'
  VENV="$JEV_HOME/venv"
  if [ ! -x "$VENV/bin/python" ] || ! "$VENV/bin/python" -c 'import sys; sys.exit(sys.prefix == sys.base_prefix)' >/dev/null 2>&1 || ! "$VENV/bin/python" -m pip --version >/dev/null 2>&1; then
    info 'Creating/repairing Python venv (one-time)...'
    "$PYBIN" -m venv "$VENV"
  fi
  if ! "$VENV/bin/python" -c 'import torch, transformers, accelerate, huggingface_hub' >/dev/null 2>&1; then
    info 'Installing missing local backend dependencies...'
    "$VENV/bin/python" -m pip install --quiet --upgrade pip
    "$VENV/bin/python" -m pip install --quiet torch transformers accelerate "huggingface_hub[cli]" || fail 'pip install failed'
  fi
  if [ "${JEV_SKIP_MODEL_DOWNLOAD:-false}" != true ]; then
    info "Downloading/resuming $MODEL_REPO to $MODEL_DIR (~18 GB; cached files are reused)..."
    "$VENV/bin/python" - "$MODEL_REPO" "$MODEL_DIR" <<'PY' || fail 'Model download failed'
import sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2])
PY
  fi
  if [ -n "$PROFILE" ]; then
    printf 'JEV_LOCAL_MODEL_DIR=%s\nJEV_LOCAL_ENDPOINT=%s\nJEV_LOCAL_HOST=%s\nJEV_LOCAL_PORT=%s\n' "$MODEL_DIR" "${JEV_LOCAL_ENDPOINT:-${JEV_ENDPOINT:-http://127.0.0.1:8763/v1/systemone}}" "${JEV_LOCAL_HOST:-127.0.0.1}" "${JEV_LOCAL_PORT:-8763}" | write_selected_config
    JEV_MODE=local "$VENV/bin/python" "$JEV_HOME/jev_local_server.py" --check --profile "$PROFILE" >/dev/null || fail 'Local server structural check failed'
    info "Local mode configured for profile '$PROFILE'. Start the backend with:"
    info "  JEV_PROFILE=$PROFILE $VENV/bin/python $JEV_HOME/jev_local_server.py --profile $PROFILE"
  else
    printf 'JEV_MODE=local\nJEV_LOCAL_MODEL_DIR=%s\nJEV_ENDPOINT=%s\n' "$MODEL_DIR" "${JEV_ENDPOINT:-http://127.0.0.1:8763/v1/systemone}" | write_env
    "$VENV/bin/python" "$JEV_HOME/jev_local_server.py" --check >/dev/null || fail 'Local server structural check failed'
    info 'Local mode configured. Start the backend with:'
    info "  $VENV/bin/python $JEV_HOME/jev_local_server.py"
  fi
  info 'Note: JEV-9B is a third-party distillation of Jev 1.13, not the original hosted model.'
fi


if [ -n "$PROFILE" ]; then JEV_MODE="$MODE" node "$JEV_HOME/jev-harness.mjs" --profile "$PROFILE" status || true
else JEV_MODE="$MODE" node "$JEV_HOME/jev-harness.mjs" status || true
fi

if [ -n "$PROFILE" ]; then
  ROUTER="$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py"
  LOCAL_ROUTER="$SCRIPT_DIR/../.agent-skills/jeo-skill/scripts/jeo-skill.py"
  if [ ! -f "$ROUTER" ] && [ -f "$LOCAL_ROUTER" ]; then ROUTER="$LOCAL_ROUTER"; fi
  if [ -f "$ROUTER" ]; then
    INSTALL_AGENT="${AGENT_TARGET:-$PROFILE}"
    ROUTER_ARGS=(install jev-control-plane --agent "$INSTALL_AGENT" --global --yes)
    if [ "$INSTALL_AGENT" = aside ]; then
      if [ -z "${JEO_SKILLS_ASIDE_ACCOUNT:-}" ]; then
        info "Profile configured; install the skill after choosing an Aside account: jeo-skill install jev-control-plane --agent aside --global --aside-account <u/N> --yes"
        ROUTER=""
      else
        ROUTER_ARGS+=(--aside-account "$JEO_SKILLS_ASIDE_ACCOUNT")
        if [ -n "${JEO_SKILLS_ASIDE_HOME:-}" ]; then ROUTER_ARGS+=(--aside-home "$JEO_SKILLS_ASIDE_HOME"); fi
      fi
    fi
    if [ -n "$ROUTER" ]; then
      CATALOG_SOURCE="$SCRIPT_DIR/../.agent-skills/skills.json"
      if [ -f "$CATALOG_SOURCE" ]; then JEO_SKILLS_CATALOG="$CATALOG_SOURCE" python3 "$ROUTER" "${ROUTER_ARGS[@]}"
      else python3 "$ROUTER" "${ROUTER_ARGS[@]}"
      fi
      info "Agent Skill installed for profile '$PROFILE' to runtime '$INSTALL_AGENT'."
    fi
  else
    info "Profile configured; install the plugin when the jeo-skill router is available: jeo-skill install jev-control-plane --agent ${AGENT_TARGET:-$PROFILE} --global --yes"
  fi
fi

if [ -n "$PROFILE" ]; then
  info "Setup complete for '$PROFILE'; check status with: node ~/.agents/jev/jev-harness.mjs --profile $PROFILE status"
else
  info 'Setup complete; status distinguishes configuration from backend readiness: node ~/.agents/jev/jev-harness.mjs status'
fi
