# Installation and Troubleshooting

Obsidian CLI is not a separate package manager install in the official docs. It is enabled from the desktop app.

## Official prerequisite flow

The CLI help page currently states:

- it requires the Obsidian `1.12` installer
- you should upgrade to the latest installer version `1.11.7`
- you should also use the latest early access version `1.12.x`

Because that wording is version-sensitive and slightly unusual, keep it as a docs requirement instead of inferring a new rule.

Enable the CLI from:

1. `Settings -> General`
2. Enable `Command line interface`
3. Follow the prompt to register the CLI

## Runtime behavior

- The desktop app must be running, or the first command launches it
- The CLI supports single commands and a TUI
- If the user wants sync without the desktop app, that is an Obsidian Headless workflow, not standard CLI usage

## Linux troubleshooting

The docs call out packaging-specific registration details.

### AppImage

- Registration creates a symlink at `/usr/local/bin/obsidian` and may require `sudo`
- If `sudo` fails, the symlink may be created at `~/.local/bin/obsidian`
- If the AppImage is moved or renamed, re-register the CLI or update the symlink manually

Useful checks from the docs:

```bash
ls -l /usr/local/bin/obsidian
sudo ln -s /path/to/obsidian /usr/local/bin/obsidian
export PATH="$PATH:$HOME/.local/bin"
```

### Snap

If the CLI cannot detect the insider build data, the docs say to point `XDG_CONFIG_HOME` to the Snap config path:

```bash
export XDG_CONFIG_HOME="$HOME/snap/obsidian/current/.config"
```

### Flatpak

The docs provide manual symlink examples:

```bash
ln -s /var/lib/flatpak/exports/bin/md.obsidian.Obsidian ~/.local/bin/obsidian
ln -s ~/.local/share/flatpak/exports/bin/md.obsidian.Obsidian ~/.local/bin/obsidian
```

## Practical guidance

- Verify `obsidian help` before assuming a command family is unavailable
- Check `PATH` before troubleshooting the app itself
- Separate packaging issues from vault or command syntax issues
