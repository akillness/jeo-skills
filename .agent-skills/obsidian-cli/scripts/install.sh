#!/usr/bin/env bash
set -euo pipefail

OBSIDIAN_BIN="${OBSIDIAN_BIN:-obsidian}"

if command -v "$OBSIDIAN_BIN" >/dev/null 2>&1; then
  echo "Found Obsidian CLI: $(command -v "$OBSIDIAN_BIN")"
  echo "If commands fail, open Obsidian and confirm Settings -> General -> Command line interface is enabled."
  exit 0
fi

cat <<'EOF'
Obsidian CLI is bundled with the desktop app and must be enabled from the app:

1. Upgrade to the installer and early access versions required by the official docs.
2. Open Obsidian.
3. Go to Settings -> General.
4. Enable "Command line interface".
5. Follow the registration prompt.

Current official CLI page notes:
- "Using the CLI requires the Obsidian 1.12 installer."
- Upgrade to the latest installer version (1.11.7) and latest early access version (1.12.x).

If the binary is still missing after registration, check the Linux notes:
- AppImage may register ~/.local/bin/obsidian instead of /usr/local/bin/obsidian
- Ensure ~/.local/bin is on PATH
- Flatpak manual symlink examples from docs:
  ln -s /var/lib/flatpak/exports/bin/md.obsidian.Obsidian ~/.local/bin/obsidian
  ln -s ~/.local/share/flatpak/exports/bin/md.obsidian.Obsidian ~/.local/bin/obsidian

After enabling the CLI, verify with:
  obsidian help
EOF

exit 1
