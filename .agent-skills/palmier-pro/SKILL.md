---
name: palmier-pro
description: >
  Drive Palmier Pro, an open source AI-native macOS video editor (Swift,
  SwiftUI/AppKit, AVFoundation) that exposes its timeline as an MCP server at
  `http://127.0.0.1:19789/mcp` so Claude Code/Desktop, Cursor, or Codex can
  read and edit a project's tracks, clips, media, transcript, captions,
  color/effects, and trigger generative AI (video/image/audio) requests
  side-by-side with a human editor. Use when the user wants to connect an
  agent to Palmier Pro's MCP server, call its timeline/clip/media/generation
  tools (`get_timeline`, `add_clips`, `move_clips`, `generate_video`, ...),
  build/run/test the Swift app from source, or debug the MCP tool surface in
  `ToolDefinitions.swift`/`ToolExecutor+*.swift`. Triggers on: "palmier pro",
  "palmier-pro", "AI video editor MCP", "connect Claude to my video editor",
  "palmier MCP server", "edit my timeline with an agent", "swift build
  PalmierPro", "palmier-pro mcpb", "manage_project"/"get_timeline"/"add_clips"
  tool.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  App requires macOS 26 (Tahoe) on Apple Silicon (arm64 only); the .dmg
  download is free with no login required. Building from source needs Xcode
  16+ and the Swift 6.2 toolchain. The MCP server only runs while the app is
  open, listening on http://127.0.0.1:19789/mcp. The editor and MCP server
  are free and open source; only the generative AI processing is closed
  source and requires login + subscription. GPLv3.
metadata:
  tags: palmier-pro, video-editor, mcp, swift, swiftui, avfoundation, ai-video, timeline-editing, macos, generative-ai
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/palmier-io/palmier-pro
---

# Palmier Pro — AI-native video editor via MCP

Palmier Pro is a Swift-native macOS video editor whose timeline is also an
MCP server: when the app is open it exposes tools like `get_timeline`,
`add_clips`, `move_clips`, `apply_color`, and `generate_video` at
`http://127.0.0.1:19789/mcp`, so an external agent (Claude Code/Desktop,
Cursor, Codex) or the in-app chat can edit the same project. The editor
itself and the MCP server are free and open source (GPLv3); only the
generative AI processing behind `generate_*`/`upscale_media` is closed
source and gated behind login + subscription.

## When to use this skill

- Connecting an MCP client (Claude Code, Claude Desktop, Cursor, Codex) to a
  running Palmier Pro instance
- Reading or editing a Palmier Pro project's timeline, tracks, clips, media,
  transcript, captions, color grade, or effects through its MCP tools
- Triggering generative AI (`generate_video`, `generate_image`,
  `generate_audio`, `upscale_media`) inside a Palmier Pro project
- Building, running, or testing the Palmier Pro Swift app from source
  (`swift build`/`swift run`/`swift test`, `scripts/dev.sh`)
- Debugging or extending the MCP tool surface itself
  (`Sources/PalmierPro/Agent/Tools/ToolDefinitions.swift`,
  `ToolExecutor+*.swift`)

## When not to use this skill

- General video editing/transcoding on Linux/Windows or without Palmier Pro
  installed → Palmier Pro is macOS 26 + Apple Silicon only; use a portable
  tool (e.g. `ffmpeg`) instead
- Generic Swift/SwiftUI app development unrelated to Palmier Pro's own
  codebase → use a general Swift/Xcode workflow, not this skill
- The user wants an MCP-free, purely local batch video pipeline → a headless
  tool is a better fit; Palmier Pro's MCP server requires the GUI app open
- Deep engineering-standards review of Palmier Pro's own Swift internals
  (concurrency, undo, actor isolation) → read `AGENTS.md` in the repo
  directly; this skill only summarizes the parts an agent-tool user needs

## Instructions

### Step 1: Confirm the app is open, then connect your MCP client

The MCP server only exists while Palmier Pro is running; there is no
standalone server binary.

```bash
# Claude Code
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp

# Codex
codex mcp add palmier-pro --url http://127.0.0.1:19789/mcp
```

For Cursor, add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "palmier-pro": { "type": "http", "url": "http://127.0.0.1:19789/mcp" }
  }
}
```

For Claude Desktop, use the bundled one-click installer inside the app:
`Help` → `MCP Instructions` → `Install in Claude Desktop`.

### Step 2: Read the timeline before editing anything

`get_timeline` is the entry point for every session — it returns project
settings (fps, resolution, duration), tracks with stable `trackId`s, clips
with stable clip ids, and a `canGenerate` flag telling you up front whether
generative tools will succeed (false means the user needs to sign in and
subscribe first). Every mutation tool addresses clips/tracks by those ids,
never by position. Use `inspect_timeline` for a narrower/windowed read on a
large project instead of re-pulling the full dump every time.

See `references/commands.md` for the full tool list grouped by workflow
area (timeline, media, clips, multicam, transcript, text/captions,
color/effects, generation, meta).

### Step 3: Make one coherent edit per tool call

Palmier Pro's tools are already designed around one filmmaker action per
call (e.g. `move_clips` moves + ripples as one undoable step). Don't
decompose a single user intent into a chain of lower-level calls — prefer
the tool that already matches the request. Use `undo` to revert the most
recent action if a result isn't what was expected, rather than trying to
manually reconstruct prior state.

### Step 4: Gate generative AI calls on `canGenerate`

`generate_video`/`generate_image`/`generate_audio`/`upscale_media` cost
tokens/subscription and fail if the user isn't signed in. Check
`get_timeline`'s `canGenerate` (or call `list_models`) before batching
multiple generation requests, and tell the user to sign in/subscribe first
if it's false — don't loop retrying a failing generation call.

### Step 5: Building/running from source (contributors)

```bash
git clone https://github.com/palmier-io/palmier-pro
cd palmier-pro
swift build
swift run
swift test
```

`./scripts/dev.sh` builds a bundled debug `.app`, launches it, and streams
its OSLog — the fastest inner loop for MCP-tool or timeline changes. Use
`swift build --traits BundledSpeech` for changes touching MLX, speech
analysis, or transcription. If you're editing `Sources/PalmierPro/Agent/`
(the tool surface itself), read `AGENTS.md`'s "Agent tool design" section
first — tools must express filmmaker intent, use stable IDs, and return
structured receipts, not mirror internal APIs.

### Step 6: Use the wrapper for a read-only environment/connectivity check

```bash
bash .agent-skills/palmier-pro/scripts/palmier-pro.sh doctor
bash .agent-skills/palmier-pro/scripts/palmier-pro.sh mcp-status
```

`doctor` only inspects the host (macOS version, arch, app presence, Swift
toolchain) and pings the local MCP endpoint — it never installs, launches,
or mutates anything.

## Best practices

1. **`get_timeline`/`inspect_timeline` before any mutation** — clip/track
   ids are stable but positions shift after every edit; never assume a
   previously-read index still points at the same clip.
2. **One user intent → one tool call** — the tools already model complete
   filmmaker actions (move-with-ripple, remove-with-linked-group); chaining
   low-level calls to fake a composite action duplicates logic Palmier Pro
   already owns and can desync from the UI's own undo grouping.
3. **Address entities by id, not position** — `trackIndex`/frame numbers
   are accepted where documented, but clip/track ids survive edits that
   positions don't.
4. **Check `canGenerate` before spending on generation** — generative calls
   are the only closed-source, paid part of the stack; everything else
   (editor, MCP server) is free.
5. **`undo` over manual reconstruction** — a single `undo` call reverts the
   last agent/user action cleanly; don't try to hand-compute the inverse of
   a `move_clips`/`apply_effect` call.
6. **Never bypass `AGENTS.md`'s concurrency/undo rules when touching
   Swift source** — main-actor file I/O, unbounded task fan-out, and
   split undo groups are explicitly called out as review blockers in the
   upstream repo.

## References

- [references/commands.md](references/commands.md) — full MCP tool reference by workflow area, plus Swift dev commands
- [scripts/palmier-pro.sh](scripts/palmier-pro.sh) — read-only `doctor` + `mcp-status` checks
- [Palmier Pro GitHub Repository](https://github.com/palmier-io/palmier-pro)
- [Palmier Pro FAQ](https://github.com/palmier-io/palmier-pro/blob/main/FAQ.md)
- [Palmier Pro AGENTS.md](https://github.com/palmier-io/palmier-pro/blob/main/AGENTS.md) — full engineering/agent-tool-design standards for contributors
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Connect Claude Code and make a scripted edit

```bash
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
```

Then, from the agent: call `get_timeline` to find the target clip's id,
then `move_clips` with `{"moves": [{"clipId": "...", "toFrame": 1500}]}`.

### Example 2: Environment check before recommending a workflow

```bash
bash .agent-skills/palmier-pro/scripts/palmier-pro.sh doctor
```

### Example 3: Build from source and verify the MCP server comes up

```bash
git clone https://github.com/palmier-io/palmier-pro
cd palmier-pro && swift build && swift run &
bash .agent-skills/palmier-pro/scripts/palmier-pro.sh mcp-status
```
