#!/bin/bash
# Runs the docs dev server. The docs load examples that Vite prebuilds into
# apps/docs/public/examples, so this builds them before every start and
# rebuilds a framework's within seconds of a change to its examples or its
# adapter (a change to core rebuilds them all), and the stylesheets after a
# change to one. Reload the page to see it.
# As a safeguard, it restarts the server with a clean build cache whenever
# `.next/dev` grows past a limit: it once filled the disk.
# Usage: scripts/docs-dev.sh (DOCS_PORT and DOCS_CACHE_LIMIT_MB are optional).

port=${DOCS_PORT:-5400}
limit=${DOCS_CACHE_LIMIT_MB:-3000}
root="$(cd "$(dirname "$0")/.." && pwd)"
docs="$root/apps/docs"
examples="$root/examples"
stamp="$docs/public/examples/.built"
frameworks="react vue svelte solid web"

# Builds the named frameworks' examples, or every framework's. A failed build
# leaves the stamp alone, so the next check tries again.
build_examples() {
  local next="$stamp.next"
  mkdir -p "$(dirname "$stamp")"
  touch "$next"
  if (cd "$examples" && node scripts/build.mjs "$@"); then
    mv "$next" "$stamp"
  else
    rm -f "$next"
    echo "[docs-dev] examples failed to build."
  fi
}

# The frameworks whose examples are stale: those with an example, a mount or
# an adapter newer than the last build, or all of them for anything else.
# Then `styles` for a newer stylesheet.
stale_frameworks() {
  [ -f "$stamp" ] || { echo "$frameworks styles"; return; }
  find "$examples" "$root"/packages/*/src -newer "$stamp" -type f \
    \( -name '*.vue' -o -name '*.svelte' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -not -name '*.test.ts' 2>/dev/null |
    while read -r file; do
      case "${file#"$root"/}" in
        *.css) echo styles ;;
        examples/*/react/* | examples/components/*/react/* | examples/mount/react.ts | packages/react/*) echo react ;;
        examples/*/vue/* | examples/components/*/vue/* | examples/mount/vue.ts | packages/vue/*) echo vue ;;
        examples/*/svelte/* | examples/components/*/svelte/* | examples/mount/svelte.ts | packages/svelte/*) echo svelte ;;
        examples/*/solid/* | examples/components/*/solid/* | examples/mount/solid.ts | packages/solid/*) echo solid ;;
        examples/*/web/* | examples/components/*/web/* | examples/mount/web.ts | packages/web/*) echo web ;;
        *) echo "$frameworks" ;;
      esac
    done | tr ' ' '\n' | sort -u | tr '\n' ' '
}

stop() {
  # The server listening on our port, and the `next dev` process that started it.
  for pid in $(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null); do kill "$pid" 2>/dev/null; done
  pkill -f "next dev --port $port" 2>/dev/null
  sleep 2
}

trap 'stop; exit 0' INT TERM

while true; do
  stop
  rm -rf "$docs/.next/dev"
  build_examples
  (cd "$docs" && DOCS_PORT=$port pnpm dev) &
  checks=0
  while sleep 2; do
    stale=$(stale_frameworks)
    if [ -n "${stale// /}" ]; then
      echo "[docs-dev] rebuilding the examples for ${stale% }."
      # shellcheck disable=SC2086 # $stale is a list of frameworks, one argument each.
      build_examples $stale
    fi
    # The cache and the server, once a minute.
    checks=$((checks + 1))
    [ $((checks % 30)) -eq 0 ] || continue
    size=$(du -sm "$docs/.next/dev" 2>/dev/null | cut -f1)
    if [ "${size:-0}" -gt "$limit" ]; then
      echo "[docs-dev] cache is ${size} MB, over ${limit} MB. Restarting with a clean cache."
      break
    fi
    lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1 || { echo "[docs-dev] server stopped. Restarting."; break; }
  done
done
