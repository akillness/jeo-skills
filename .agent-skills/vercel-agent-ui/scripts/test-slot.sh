#!/bin/bash
# Runs a command once one of a few machine-wide test slots is free, so parallel
# sessions don't all run browsers at once and slow every run down.
# Usage: scripts/test-slot.sh <command...>   (UI_SDK_TEST_SLOTS sets the count, default 2).
# Example: scripts/test-slot.sh npx playwright test specs/slider --project react

slots=${UI_SDK_TEST_SLOTS:-2}
dir=/tmp/ui-sdk-test-slots
mkdir -p "$dir"

claim() {
  for i in $(seq 1 "$slots"); do
    local slot="$dir/$i"
    if mkdir "$slot" 2>/dev/null; then
      echo $$ > "$slot/pid"
      echo "$slot"
      return 0
    fi
    # A slot whose owner has exited is free again.
    local owner
    owner=$(cat "$slot/pid" 2>/dev/null)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      rm -rf "$slot"
    fi
  done
  return 1
}

waited=0
until slot=$(claim); do
  [ $((waited % 60)) -eq 0 ] && echo "[test-slot] waiting for a free slot (${waited}s)."
  sleep 5
  waited=$((waited + 5))
done

trap 'rm -rf "$slot"' EXIT
trap 'exit 130' INT TERM
"$@"
