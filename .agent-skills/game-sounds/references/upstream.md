# Upstream reference

## Provenance

- Repository: https://github.com/Citedy/game-sounds
- Inspected commit: `cc18cd9734f8ec3b2b853a294e56698d746ffadb`
- Package version at that commit: `3.0.1`
- License file: MIT for the repository software

## Installation surfaces

- Claude Code marketplace: add `citedy/claude-plugins`, then install `game-sounds@citedy`.
- npm CLI: `npm i -g @citedy/game-sounds`.
- local clone: `~/.claude/plugins/game-sounds`.

Marketplace and local plugin changes require a Claude Code restart before lifecycle hooks are reliable.

## CLI surface

The upstream CLI supports:

```text
game-sounds status
game-sounds list
game-sounds switch [pack]
game-sounds rotation [add|remove|clear] [pack]
game-sounds volume <0.0-1.0>
game-sounds toggle <event>
game-sounds test [category]
```

At the inspected commit the package advertises 552 sounds across 63 packs. Do not hard-code those counts as a permanent invariant; use `game-sounds list` against the installed version.

## Config contract

```json
{
  "volume": 0.5,
  "active_pack": "warcraft",
  "pack_rotation": [],
  "enabled_events": {
    "session-start": true,
    "task-acknowledge": true,
    "task-complete": true,
    "error": true,
    "permission": true
  }
}
```

A non-empty rotation selects one pack for a session. Switching the active pack clears rotation in the upstream CLI.

## Playback support

- macOS: `afplay`
- Linux: `paplay`, `pw-play`, or `ffplay`

Windows behavior must be checked against the installed version and environment. A successful config read does not prove an audio device is available.

## Rights note

The repository's software is MIT-licensed. Its README separately credits sources for audio files and notes third-party trademarks. Treat every custom or redistributed sound as an asset-rights question; do not infer that the software license grants rights to all recognizable recordings, music, characters, or trademarks.
