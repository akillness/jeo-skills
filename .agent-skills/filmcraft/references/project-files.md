# Project files and output boundaries

Source: [`docs/project-files.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/project-files.md), pinned to `1fdfd8324db4aa23b08c69f518b086e632f75f84` (inspected 2026-10-12).

## `.fcproj`

- A project is UTF-8 JSON with envelope `format: "filmcraft.project"`; this build writes schema version 13 and reads older versions through migrations.
- `project` stores bins, media clips, sequences, tracks, clips, effects, keyframes, and markers. Media is referenced by path and is not embedded.
- Optional `view` stores open sequence tabs, zoom/scroll/track heights, and playheads; it is not part of the edit or an undo step.
- A newer unsupported schema is refused rather than partially read. Opening an older schema migrates in memory; the first save over the old file creates a schema backup.
- Writes use an atomic same-directory temp file, `fsync`, rename, and directory `fsync`; on failure the old file remains untouched.

## Save and recovery commands

| Command | Effect |
|---|---|
| `file.save {path?}` | Write to current project path or an explicit path |
| `file.saveAs {path}` | Write and adopt a new path |
| `file.saveCopy {path}` | Write a copy while retaining the current path/state |
| `file.revert` | Reload the last saved version and discard changes |
| `file.open {path}` | Open a project and report schema/migration |

The CLI's `--save` writes back to `--project`; `--save-as` writes a new path after the command. Proceed when the user has already authorized that exact operation/path; otherwise ask only when consent is missing or the destination is unclear, and always check for overwrite. MCP/bridge `file.*` commands have the same project semantics.

## Media and export warnings

Importing media changes project state, but media remains external. Relinking and auto-relink can update path references. Export/render can draw placeholders for missing, offline, or unreadable media; inspect the returned `offlineMedia` and warnings. Do not call this a successful media export unless the caller explicitly accepts placeholders with `--allow-offline`.

Auto-save and recovery journals use the FilmCraft data directory. Do not delete or alter them unless the user explicitly requests recovery maintenance. A desktop control `app.quit` bypasses the save prompt; unsaved work remains in recovery, so treat it as a destructive lifecycle action and require explicit authorization when it is not already covered.
