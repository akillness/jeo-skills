---
name: filmcraft
description: >
  Operate the FilmCraft open-source Rust video editor through its installed `filmcraft-cli`
  headless CLI/MCP server or desktop loopback control bridge: inspect projects and sequences,
  import media, run undoable commands, render previews, save `.fcproj` projects, and export
  media or interchange files. Use when a user asks to edit, automate, inspect, or troubleshoot
  FilmCraft. Route programmable or templated video generation to `video-production`, OpenCut
  repository work to `opencut`, and Palmier Pro timeline work to `palmier-pro`.
allowed-tools: Read Write Edit Bash Grep Glob
compatibility: Requires an installed FilmCraft release or a source checkout with Rust/Cargo; an MCP-capable client is optional.
---

# FilmCraft

Source-grounded operator guidance for FilmCraft at pinned upstream commit
[`1fdfd8324db4aa23b08c69f518b086e632f75f84`](https://github.com/storytold/filmcraft/tree/1fdfd8324db4aa23b08c69f518b086e632f75f84).
The source was inspected on 2026-10-12. Read the linked references before constructing commands.

## When to use this skill

- The user names FilmCraft, `filmcraft-cli`, `.fcproj`, the FilmCraft MCP server, or its control channel.
- The task is local timeline editing, project/sequence inspection, media import, preview rendering, export, or FilmCraft automation.

## Route elsewhere

- Use [`video-production`](../video-production/SKILL.md) for programmable/template video generation rather than editing a FilmCraft project.
- Use [`opencut`](../opencut/SKILL.md) for OpenCut repository/setup/contribution work.
- Use [`palmier-pro`](../palmier-pro/SKILL.md) for Palmier Pro timeline/MCP work.
- Use a general browser or desktop skill for unrelated apps; do not infer a FilmCraft headless API from another tool.

## Permission gates

Before an install/build/package download, media import or edit, save/export/write/overwrite, client/MCP configuration change, destructive edit or quit, or external provider call, check that the user explicitly authorized that exact operation and destination. Existing authorization covering the exact operation/path is sufficient; ask only when consent is missing, the destination is unclear, or the action is newly destructive. FilmCraft's documented control/MCP paths are local; no provider call is implied.

## Instructions

1. **Choose a backend.** Use headless CLI/MCP with `filmcraft-cli --demo`, `--project /abs/project.fcproj`, or an empty session. Use the desktop bridge by starting `filmcraft --control 9876`, then `filmcraft-cli --bridge 127.0.0.1:9876` or MCP bridge mode. The channel is loopback-only and unauthenticated; enable it only while needed. For `mcp`, never combine `--bridge` with `--project` or `--demo`: the bridge backend wins and those project/demo flags are silently ignored. Verify the running desktop app's current project before mutation.
2. **Respect truth boundaries.** Do not claim a `filmcraft doctor`, remote service, folder-confinement flag, or production support: none is verified here.

## Best practices

1. Check the binary (`filmcraft-cli --version`) or identify the source checkout and pinned commit.
2. Inspect before acting: `filmcraft-cli --project /abs/project.fcproj inspect` or `inspect sequence`; use `commands`/`describe` to confirm ids, parameters, enabled state, media paths, backend, and the current project. Resolve any target mismatch before mutation.
3. For a change, confirm exact-operation/path authorization; ask only if consent is missing, the destination is unclear, or the action is newly destructive. Then use `exec`/`run` or MCP `command_run`/`command_batch`, and inspect again.
4. Verify with `render`/MCP `render_frame` or a bridge `ui_screenshot`; if the result is wrong, use the documented undo command before trying another edit.
5. Save/export only to an authorized path, check for overwrite, report exact paths and warnings, and never hide offline-media or partial-output conditions.

## Examples

```sh
filmcraft-cli --demo inspect
filmcraft-cli --project /abs/project.fcproj commands
filmcraft-cli --project /abs/project.fcproj describe sequence.inspect
filmcraft-cli --project /abs/project.fcproj import /abs/clip.mov --save-as /abs/copy.fcproj
filmcraft-cli --project /abs/project.fcproj render --seconds 2 --out /abs/frame.png
filmcraft-cli --project /abs/project.fcproj export /abs/out.mp4 --format h264
filmcraft --control 9876
filmcraft-cli mcp --bridge 127.0.0.1:9876
filmcraft-cli mcp --project /abs/project.fcproj
```

`--save-as` and output paths are examples only: confirm authorization covers the exact operation and path, and check for overwrite; ask only when that is not clear. See [`references/cli-mcp.md`](references/cli-mcp.md) for option placement and MCP registration.

## Truth boundaries

- FilmCraft is alpha; the upstream roadmap estimates feature breadth around 86% and readiness for real work around 56% (2026-10-10).
- `.prproj` is not supported; use documented FCP7 XML, AAF, or OTIO interchange. There is no plugin hosting, no AV1 export, and release speech-to-text is off by default.
- Missing or offline media can render placeholders; exports report `offlineMedia` and the CLI exits 1 unless explicitly allowed. Never present that as a successful media render.
- See [`references/troubleshooting.md`](references/troubleshooting.md) for failure signatures and [`references/upstream-evidence.md`](references/upstream-evidence.md) for pinned provenance and capability limits.

## References

- [`references/cli-mcp.md`](references/cli-mcp.md) - build, CLI options, MCP modes/tools, and registration.
- [`references/control-channel.md`](references/control-channel.md) - loopback JSON-lines transport, UI methods, and input safety.
- [`references/project-files.md`](references/project-files.md) - `.fcproj` schema, save semantics, recovery, and output warnings.
- [`references/troubleshooting.md`](references/troubleshooting.md) - verified failure signatures and capability limits.
- [`references/upstream-evidence.md`](references/upstream-evidence.md) - pinned source map, licenses, and inspection date.
