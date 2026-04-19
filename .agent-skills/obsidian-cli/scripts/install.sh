#!/usr/bin/env bash
set -euo pipefail

OBSIDIAN_BIN="${OBSIDIAN_BIN:-obsidian}"

if command -v "$OBSIDIAN_BIN" >/dev/null 2>&1; then
  echo "Found Obsidian CLI: $(command -v "$OBSIDIAN_BIN")"
  echo "If commands fail, open Obsidian and confirm Settings -> General -> Command line interface is enabled."
  echo "Quick verification: obsidian help && obsidian version"
  exit 0
fi

cat <<'EOF'
Obsidian CLI is bundled with the desktop app and must be enabled from Obsidian:

1. Upgrade to the current official installer version (docs currently say 1.12.7+).
2. Open Obsidian.
3. Go to Settings -> General.
4. Enable "Command line interface".
5. Follow the registration prompt.

Current official guidance:
- Obsidian CLI controls the desktop app from the terminal.
- If you need Sync/Publish without the desktop app, use Obsidian Headless instead.

Platform checks if the binary is still missing after registration:
- macOS: ls -l /usr/local/bin/obsidian
- Linux: ls -l ~/.local/bin/obsidian && export PATH="$HOME/.local/bin:$PATH"

After enabling the CLI, verify with:
  obsidian help
  obsidian version
EOF

exit 1
