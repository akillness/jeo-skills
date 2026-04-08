# RTK Troubleshooting

Use this file when the user says RTK is installed but not working as expected.

## Symptom: `rtk gain` is missing

### Likely cause

The wrong `rtk` package is installed.

### Fix

```bash
cargo uninstall rtk
bash scripts/install.sh --force-uninstall-wrong
rtk gain
```

## Symptom: `rtk` command not found after install

### Likely cause

The binary directory is not on `PATH`.

### Fix

```bash
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"
```

Apply only the path that matches the install method.

## Symptom: Claude Code is still verbose

### Checks

```bash
rtk gain
rtk init --show
```

Then ask:

1. Was the action executed through the Bash tool?
2. Was `rtk init -g` run and was settings patching accepted?
3. Did Claude Code restart after hook changes?

## Symptom: Codex still uses raw output

Codex is not a transparent shell-hook integration. `rtk init --codex` installs prompt guidance, not command mutation for built-in tools.

Use:

```bash
rtk read path/to/file
rtk grep "pattern" .
rtk git status
```

## Symptom: OpenCode did not pick up RTK

### Checks

```bash
rtk init -g --opencode
ls -la ~/.config/opencode/plugins/rtk.ts
```

Then restart OpenCode.

## Symptom: Windows wrappers fail for Node-based tools

### Likely cause

Older RTK versions did not resolve `.CMD` and `.BAT` wrappers correctly.

### Fix

Use RTK `0.23.1+` and reinstall:

```bash
cargo install --git https://github.com/akillness/rtk
rtk --version
```

## Symptom: A single command should bypass RTK

Use:

```bash
RTK_DISABLED=1 <your command>
```

Do this before suggesting uninstall or config changes.
