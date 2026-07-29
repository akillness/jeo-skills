---
name: game-sounds
description: >
  Install, configure, and troubleshoot Citedy's game-sounds feedback audio for
  Claude Code and supported CLI environments. Use when a user wants coding-agent
  event sounds, sound-pack rotation, volume or event toggles, playback checks,
  custom packs, or the game-sounds CLI/plugin. Triggers on: game-sounds, coding
  sounds, Claude hook sounds, task-complete sound, sound pack rotation, or
  @citedy/game-sounds.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: macOS, Linux, or Windows with Python 3 and a supported local audio player; Claude hooks require Claude Code
metadata:
  tags: utilities, developer-experience, audio, claude-code, hooks, sound-packs
  version: "1.0.0"
  source: https://github.com/Citedy/game-sounds
---

# Game Sounds

## When to use this skill

- Install or verify `@citedy/game-sounds`.
- Switch a sound pack, manage rotation, set volume, or toggle event categories.
- Diagnose a silent hook or create a custom local pack.
- Explain the difference between the standalone CLI and Claude Code hook integration.

Route game-production SFX design or asset generation to `rfxgen`, `game-vfx`, or an engine-specific audio skill. This skill is for developer-agent feedback sounds, not a game's runtime audio system.

## Instructions

### Step 1: Capture the operating mode

Identify:

- host: Claude Code plugin, global npm CLI, or cloned plugin directory;
- action: install, status, configure, test, or custom pack;
- platform player: `afplay` on macOS; `paplay`, `pw-play`, or `ffplay` on Linux;
- acceptable audio behavior: volume, enabled events, and whether random rotation is desired.

### Step 2: Check before installing

```bash
bash .agent-skills/game-sounds/scripts/setup.sh --check
```

Prefer the official Claude marketplace path when the user is in Claude Code. Use npm for a global `game-sounds` CLI, or clone only when a local plugin directory is explicitly wanted.

```bash
bash .agent-skills/game-sounds/scripts/setup.sh --npm
bash .agent-skills/game-sounds/scripts/setup.sh --clone
```

Restart Claude Code after plugin installation or hook changes.

### Step 3: Validate configuration before editing it

The upstream configuration has four fields: `volume`, `active_pack`, `pack_rotation`, and `enabled_events`.

```bash
python3 .agent-skills/game-sounds/scripts/validate_config.py /path/to/config.json
```

Require volume in `[0.0, 1.0]`, safe pack names, a unique string rotation list, and booleans for all event toggles. Prefer the upstream CLI over direct JSON edits:

```bash
game-sounds status
game-sounds list
game-sounds switch starcraft
game-sounds rotation add zelda
game-sounds volume 0.3
game-sounds test task-complete
```

### Step 4: Map hooks to observable events

The inspected upstream hook mapping is:

- `SessionStart` → `session-start`
- `UserPromptSubmit` → `task-acknowledge`
- `Stop` → `task-complete`
- `PostToolUseFailure` → `error`
- `Notification` → `permission`

When a hook is silent, check config discovery, event enablement, pack/category files, executable permissions, and the platform audio player in that order.

### Step 5: Add custom packs conservatively

Create one pack directory with event-category subdirectories. Use only audio the user owns or is licensed to distribute. The upstream repository is MIT for its software, but bundled sounds and recognizable game/media properties may carry separate rights; preserve upstream credits and do not represent the audio catalog as universally redistributable.

### Step 6: Verify real playback

A status command only proves configuration. Run one explicit `game-sounds test <category>` and confirm audible output with the user. If the environment is headless or has no audio device, report that configuration passed but playback was not verified.

## Examples

### Set a quiet rotating pair

```bash
game-sounds rotation clear
game-sounds rotation add mario
game-sounds rotation add zelda
game-sounds volume 0.2
game-sounds status
```

### Validate a cloned plugin config

```bash
python3 .agent-skills/game-sounds/scripts/validate_config.py \
  "$HOME/.claude/plugins/game-sounds/config.json" --json
```

## Best practices

1. Use the CLI for changes and the validator for diagnosis.
2. Test one event explicitly after configuration.
3. Keep volume low and allow event categories to be disabled.
4. Do not install or play sounds without user consent in shared or accessibility-sensitive environments.
5. Separate software licensing from the rights of bundled audio assets and trademarks.

## References

- `references/upstream.md` — current upstream package, commands, hook map, and platform notes.
- [Citedy/game-sounds](https://github.com/Citedy/game-sounds)
