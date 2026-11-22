#!/usr/bin/env bash
# Copy the measuring and capture tools into a checkout's .dream-loop/moves/ (gitignored scratch),
# where their relative imports (../../src, ../../tests/helpers) resolve, and say how to start the
# capture receiver.   install.sh [checkout]   (default: the current directory)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "${1:-.}" && pwd)
[ -f "$repo/src/player-native/humgen-motion.mjs" ] || { echo "not a Thornvigil checkout: $repo"; exit 1; }
grep -q '^\.dream-loop/' "$repo/.gitignore" || { echo ".dream-loop/ is not gitignored in $repo; stopping"; exit 1; }
mkdir -p "$repo/.dream-loop/moves"
cp "$here"/tools/* "$repo/.dream-loop/moves/"
echo "tools in $repo/.dream-loop/moves:"; ls "$repo/.dream-loop/moves" | grep -E '\.(mjs|js|py|swift|html)$' | tr '\n' ' '; echo
if lsof -nP -iTCP:6163 -sTCP:LISTEN >/dev/null 2>&1; then echo "capture receiver already listening on 6163"
else echo "start the capture receiver (background, from the checkout):"; echo "  node scripts/changelog-capture-receiver.mjs .dream-loop/moves 6163"; fi
echo "capture host: http://localhost:5173/.dream-loop/moves/host.html (dev server: preview_start thornwake-dev)"
