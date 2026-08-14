# Palmier Pro — MCP tool reference

Palmier Pro has no CLI for editing. Every edit — from the in-app chat and
from an external MCP client (Claude Code/Desktop, Cursor, Codex) — goes
through the same MCP tool surface, defined in
`Sources/PalmierPro/Agent/Tools/ToolDefinitions.swift` and implemented in the
`ToolExecutor+*.swift` files. This is a curated reference grouped by
workflow area; read a tool's live JSON schema through the MCP client before
calling it — descriptions and required parameters can change between
releases.

Always call `get_timeline` first in a session. It returns project settings
(fps, resolution, duration), tracks with stable `trackId`s, and clips with
stable clip ids — every other clip/track mutation tool addresses entities by
those ids, not by position.

## Projects

| Tool | Purpose |
|---|---|
| `manage_project` | Open, create, save, or switch the active `.palmier` project package. |

## Timeline & project settings

| Tool | Purpose |
|---|---|
| `get_timeline` | Full read of project settings, tracks, and clips. Call first, every session. |
| `inspect_timeline` | Narrower/windowed read of the timeline (e.g. a frame range) without the full dump. |
| `create_timeline` | Create a new sequence/timeline inside the project. |
| `set_active_timeline` | Switch which timeline subsequent tools operate on. |
| `manage_markers` | Add, move, or remove timeline markers. |
| `set_project_settings` | Change fps, resolution, or other project-level settings. |
| `export_project` | Render/export the timeline to a media file. |
| `manage_exports` | Inspect or cancel in-flight/queued export jobs. |

## Media library

| Tool | Purpose |
|---|---|
| `get_media` | List media items in the project's media bin. |
| `inspect_media` | Read detailed metadata (duration, codec, resolution) for one media item. |
| `search_media` | Find media by name/tag/content. |
| `import_media` | Import a file from disk into the project's media library. |
| `capture_frame` | Grab a still frame from a clip/media at a given time. |
| `organize_media` | Rename, tag, or bin/folder-sort media items. |

## Tracks & clips

| Tool | Purpose |
|---|---|
| `manage_tracks` | Add, remove, reorder, mute/hide, or lock tracks. |
| `manage_clip_links` | Link or unlink clips (e.g. video + its paired audio) so they move/delete together. |
| `add_clips` | Append clips from media onto a track. |
| `insert_clips` | Insert clips at a specific frame, rippling later clips forward. |
| `move_clips` | Move one or more clips to a new track and/or start frame as one undoable action. `toTrack`/`toFrame` are each optional per entry. |
| `remove_clips` | Delete clips by id; removing one half of a link group removes the whole group. |
| `split_clips` | Cut clips at given frames. |
| `ripple_delete_ranges` | Remove a frame range and ripple everything after it backward. |
| `swap_clip_media` | Replace a clip's underlying media source while keeping its timeline position/trims. |
| `set_clip_properties` | Set per-clip properties (speed, volume, opacity, trims, transform/crop, fades, rounding). |
| `copy_clip_settings` | Copy properties/grade/effects from one clip onto others. |
| `set_keyframes` | Animate a clip property over time (position, crop, opacity, etc.). |
| `apply_layout` | Apply a preset layout/arrangement (e.g. multi-clip grid or split screen). |
| `sync_clips` | Auto-align clips (e.g. by audio waveform) across tracks. |
| `undo` | Undo the last agent- or user-initiated action. |

## Multicam

| Tool | Purpose |
|---|---|
| `manage_multicam` | Create or configure a multicam clip group from synced sources. |
| `change_cam` | Switch the active angle on a multicam clip at a given time. |
| `get_multicam` | Read a multicam group's angles and current cut points. |

## Transcript & audio

| Tool | Purpose |
|---|---|
| `get_transcript` | Read the spoken-word transcript for a clip/track. |
| `remove_words` | Cut specific words out of the timeline using transcript-aligned edits. |
| `remove_silence` | Auto-detect and ripple-delete silent gaps. |
| `detect_beats` | Detect musical beats for beat-synced cutting. |
| `denoise_audio` | Apply noise reduction to a clip's audio. |

## Text & captions

| Tool | Purpose |
|---|---|
| `add_texts` | Add text overlay clips. |
| `update_text` | Edit text content/style on an existing text or caption group (`captionGroupId`). |
| `add_captions` | Generate caption clips from a transcript. |

## Color & effects

| Tool | Purpose |
|---|---|
| `apply_color` | Apply or copy a color grade, in Palmier's own grade vocabulary. |
| `apply_effect` | Apply a visual/audio effect (`{type, params}`) to a clip. |
| `inspect_color` | Read a clip's current grade. |
| `denoise_audio` | See Transcript & audio — audio noise reduction. |

## Generative AI

Requires the user to be signed in and subscribed; `get_timeline`'s
`canGenerate` flag tells you up front whether these will succeed.

| Tool | Purpose |
|---|---|
| `list_models` | List available generation models (Seedance, Kling, Nano Banana Pro, GPT-image, etc.) and their capabilities. |
| `generate_video` | Generate a video clip from a prompt/reference media. |
| `generate_image` | Generate a still image from a prompt/reference media. |
| `generate_audio` | Generate audio/music/sound from a prompt. |
| `upscale_media` | Upscale an existing image/video clip. |

## Meta

| Tool | Purpose |
|---|---|
| `send_feedback` | Send user feedback/bug reports to Palmier. |
| `read_skill` | Read a bundled in-app agent skill/playbook. |
| `manage_skills` | List/enable/disable in-app agent skills. |

## Swift developer commands (building from source)

Not MCP tools — these are for contributors building/testing the app itself
(`CONTRIBUTING.md`, `CLAUDE.md`):

```bash
swift build                              # debug build
swift run                                # build + launch
swift test                               # unit tests
swift build --traits BundledSpeech       # MLX/on-device speech, transcription changes
./scripts/dev.sh                         # bundled debug .app + streamed OSLog
./scripts/dev.sh --speech --telemetry    # + BundledSpeech / ProductionTelemetry traits
./scripts/bundle.sh debug --fast         # bundle only, no launch/stream
./scripts/release.sh                     # release packaging (maintainers)
```
