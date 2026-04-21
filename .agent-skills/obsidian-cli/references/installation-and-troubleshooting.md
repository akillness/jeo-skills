# Installation and Troubleshooting

Obsidian CLI is not a separate package-manager install. It is bundled with the desktop app and enabled from Obsidian itself.

## Official prerequisite flow

Current official docs say:
- upgrade to the latest Obsidian **installer version `1.12.7+`**
- open Obsidian and go to `Settings -> General`
- enable **Command line interface**
- follow the registration prompt

Quick verification:

```bash
obsidian help
obsidian version
```

If the CLI binary is still missing, use the checks below before assuming the command surface is unavailable.

## Runtime behavior
- Obsidian CLI controls the **desktop app from the terminal**.
- The app must be installed and desktop-accessible on the current machine.
- If Obsidian is closed, the first CLI command launches it.
- If the user wants Sync/Publish without the desktop app, that is an **Obsidian Headless** workflow, not standard CLI usage.

## Platform notes from current official docs

### Windows
- Obsidian CLI requires the Obsidian installer `1.12.7+`.
- The installer adds the `Obsidian.com` terminal redirector next to `Obsidian.exe` so stdin/stdout work properly from the terminal.

### macOS
- CLI registration creates a symlink at `/usr/local/bin/obsidian` pointing to the bundled CLI binary inside the app.
- This requires administrator privileges and may prompt through a system dialog.

Useful checks:

```bash
ls -l /usr/local/bin/obsidian
sudo ln -sf /Applications/Obsidian.app/Contents/MacOS/obsidian-cli /usr/local/bin/obsidian
```

### Linux
- Current docs say CLI registration copies the CLI binary to `~/.local/bin/obsidian`.
- This avoids persistence problems with install methods that run from temporary directories.

Useful checks:

```bash
ls -l ~/.local/bin/obsidian
cp /path/to/Obsidian/obsidian-cli ~/.local/bin/obsidian
chmod 755 ~/.local/bin/obsidian
export PATH="$HOME/.local/bin:$PATH"
```

## Practical guidance
- Separate **desktop registration problems** from **vault/command syntax problems**.
- Check `PATH` before debugging the app itself.
- Re-check official docs when packaging details change; OS-specific registration behavior can drift.
- Keep headless/service expectations out of this skill. If the machine has no desktop session, route out early.
