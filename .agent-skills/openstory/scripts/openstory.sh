#!/usr/bin/env bash
# OpenStory skill helper — read-only inspection only.
# Never installs, migrates, deploys, or writes to the repo. `env-check`
# reports variable NAMES only and never prints a value.
#
# Usage:
#   openstory.sh doctor    [repo_path]   # host + repo readiness report
#   openstory.sh env-check [repo_path]   # which env var names are set (no values)
#   openstory.sh phases                  # storyboard pipeline phases, in order

set -euo pipefail

cmd="${1:-}"
repo="${2:-.}"

usage() {
  sed -n '2,10p' "$0"
  exit 1
}

# Compare "major.minor.patch" against a required major floor.
major_of() { echo "${1#v}" | cut -d. -f1; }

case "$cmd" in
  doctor)
    echo "== OpenStory readiness report (read-only) =="
    echo "   repo path: $repo"

    if command -v bun >/dev/null 2>&1; then
      bun_v="$(bun --version 2>/dev/null || echo unknown)"
      bun_major="$(major_of "$bun_v")"
      bun_minor="$(echo "$bun_v" | cut -d. -f2)"
      if [[ "$bun_major" == "1" && "${bun_minor:-0}" -ge 3 ]] || [[ "$bun_major" -gt 1 ]]; then
        echo "  ok    bun            $bun_v (requires >=1.3.0 <2)"
      else
        echo "  WARN  bun            $bun_v (requires >=1.3.0 <2)"
      fi
    else
      echo "  ERROR bun            not on PATH — install from https://bun.com/docs/installation"
    fi

    if command -v node >/dev/null 2>&1; then
      node_v="$(node --version 2>/dev/null || echo unknown)"
      node_major="$(major_of "$node_v")"
      if [[ "$node_major" == "24" ]]; then
        echo "  ok    node           $node_v (requires >=24 <25)"
      else
        echo "  WARN  node           $node_v (requires >=24 <25)"
      fi
    else
      echo "  WARN  node           not on PATH (engines require >=24 <25)"
    fi

    if command -v git >/dev/null 2>&1; then
      echo "  ok    git            $(git --version 2>/dev/null)"
    else
      echo "  WARN  git            not on PATH"
    fi

    if [[ -f "$repo/package.json" ]] && grep -q '"openstory"' "$repo/package.json" 2>/dev/null; then
      echo "  ok    repo           OpenStory package.json detected"
    elif [[ -f "$repo/wrangler.jsonc" && -f "$repo/package.json" ]]; then
      echo "  info  repo           package.json + wrangler.jsonc present (name not matched)"
    else
      echo "  info  repo           no OpenStory checkout at '$repo'"
      echo "        clone: git clone https://github.com/openstory-so/openstory.git"
    fi

    if [[ -d "$repo/node_modules" ]]; then
      echo "  ok    deps           node_modules present"
    else
      echo "  info  deps           node_modules missing — run 'bun install'"
    fi

    if [[ -f "$repo/.env.local" ]]; then
      echo "  ok    .env.local     present (bun dev generates it on first run)"
    else
      echo "  info  .env.local     missing — 'bun dev' will generate it"
    fi

    if [[ -d "$repo/.wrangler" ]]; then
      echo "  ok    local state    .wrangler/ present (Miniflare D1/R2 state)"
    else
      echo "  info  local state    .wrangler/ absent — no local run yet"
    fi

    echo "  note  video export is production-only (container binding)."
    echo "  note  AI generation spends real money via FAL_KEY."
    echo "== end of report; nothing was installed or changed =="
    ;;

  env-check)
    envfile="$repo/.env.local"
    echo "== OpenStory env presence (names only, values never printed) =="
    if [[ ! -f "$envfile" ]]; then
      echo "  no .env.local at $envfile — run 'bun dev' once to generate it"
      exit 0
    fi
    for key in \
      VITE_APP_URL VITE_APP_NAME BETTER_AUTH_SECRET API_KEY_ENCRYPTION_KEY \
      FAL_KEY OPENROUTER_KEY XAI_API_KEY FAL_BILLING_KEY FAL_PRICING_KEY \
      MODELSCHEMAS_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET EMAIL_FROM \
      STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET R2_PUBLIC_STORAGE_DOMAIN \
      ADMIN_EMAILS
    do
      if grep -qE "^[[:space:]]*${key}=[^[:space:]]" "$envfile" 2>/dev/null; then
        echo "  set     $key"
      else
        echo "  unset   $key"
      fi
    done
    echo "  hint  FAL_KEY and/or OPENROUTER_KEY are required for any generation."
    echo "  hint  EMAIL_FROM unset in dev = fixed-OTP sign-in (zero friction)."
    ;;

  phases)
    cat <<'EOF'
== OpenStory storyboard pipeline (src/functions/sequences.ts -> STORYBOARD_WORKFLOW) ==
  0. Verify + Prepare     <1s     script, aspectRatio, styleConfig, analysis/image/video model ids
  0b. Generate Poster     --      posterUrl (non-critical; failure does not stop the run)
  1. Scene Splitting      ~3min   scenes[], title, shotMapping[], bibles[]  (2 parallel streaming LLM calls)
  2. Casting              ~2.5min talent matching || location matching (Promise.all)
  3. References+Prompts   ~1min   character sheets || location sheets || visual prompts
  4. Frame Images         ~3min   fal image gen x scenes, THEN motion/music prompts (sequential since #929)
  5. Motion + Music       1-5min  motion batch -> merge video; music -> merge audio+video -> finalVideoUrl
  6. Complete             <1s     emits generation.complete + completeScenes[]

Timings are from a 9-scene local Workerd run. Identify the failing phase from
workflowRunId / sequence_events before changing any code.
EOF
    ;;

  *)
    usage
    ;;
esac
