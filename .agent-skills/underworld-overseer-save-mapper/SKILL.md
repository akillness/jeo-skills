---
name: underworld-overseer-save-mapper
description: >
  Inspect Underworld Overseer JSON saves and generate or troubleshoot interactive
  dungeon maps with RobThePCGuy/Underworld-Overseer-Save-Mapper. Use when a user
  wants to validate a save's Map records, visualize room coordinates and
  DescriptorID values, install the mapper, or diagnose empty/broken HTML output.
  Triggers on: Underworld Overseer save, dungeon save map, DescriptorID, Map JSON,
  Underworld Overseer mapper, or save-to-HTML.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Python 3; upstream mapper expects a local graphical/browser workflow and defaults to the Windows save location
metadata:
  tags: game-development, save-files, json, map-visualization, underworld-overseer
  version: "1.0.0"
  source: https://github.com/RobThePCGuy/Underworld-Overseer-Save-Mapper
---

# Underworld Overseer Save Mapper

## When to use this skill

- Validate an Underworld Overseer `.json` save before opening it in the mapper.
- Install or update the upstream mapper without copying game saves.
- Generate an interactive HTML dungeon map or diagnose missing cells, labels, or output.
- Inspect coordinate bounds, descriptor counts, or duplicate map coordinates.

Do not use this skill for unrelated save formats, save editing, or reverse engineering protected game data. It visualizes user-owned save files; it does not modify progression.

## Instructions

### Step 1: Preserve the source save

Work on a copy. Record the input path and hash when reproducibility matters. Never overwrite the game's active save, and never claim the mapper is a save editor.

### Step 2: Validate the JSON before installing or launching anything

Run:

```bash
python3 .agent-skills/underworld-overseer-save-mapper/scripts/validate_save.py /path/to/save.json
```

The required shape is a top-level object with a `Map` list. Every map cell must contain integer `X` and `Y` coordinates and a non-empty string `DescriptorID`. Treat duplicate `(X, Y)` coordinates as ambiguous because the upstream renderer indexes cells by coordinate.

### Step 3: Choose the smallest operating mode

1. **Inspection only** — use `validate_save.py --json`; no mapper install is needed.
2. **Interactive map generation** — install/check upstream with `scripts/setup.sh`, then run its `main.py` in a local terminal.
3. **Mapper code changes** — clone a pinned ref, inspect `main.py` and `template.html`, and test against a redacted fixture.

Do not reach for browser automation just to parse the save. A browser is only needed to view the generated HTML.

### Step 4: Install or check the upstream mapper

```bash
bash .agent-skills/underworld-overseer-save-mapper/scripts/setup.sh --check
bash .agent-skills/underworld-overseer-save-mapper/scripts/setup.sh --install
```

The installer uses a dedicated data directory and virtual environment. It installs `pandas` and `matplotlib`; `pathlib` is part of Python and must not be installed from PyPI.

### Step 5: Generate and verify the map

Run `main.py` from the installed repository. The current upstream UI is interactive and looks first in:

```text
~/AppData/LocalLow/MyronSoftware/UnderworldOverseer/Saves
```

If that directory is unavailable, the current program exits before offering a custom path; either run on the supported Windows profile or make a reviewed upstream code change. Verify that:

- the output HTML exists and is non-empty;
- rendered coordinate bounds match validator output;
- representative descriptors appear in the legend;
- search, zoom/pan, color controls, and dark mode work locally;
- no save file was changed.

### Step 6: Report limitations honestly

The repository README describes the project as beta. Its README advertises MIT, but the inspected upstream commit has no root `LICENSE` file. Do not redistribute upstream code or binaries as though the license were verified; see `references/upstream.md`.

## Examples

### Validate without rendering

```bash
python3 .agent-skills/underworld-overseer-save-mapper/scripts/validate_save.py save.json --json
```

### Install a pinned revision

```bash
REF=5f83b078682d86624941fa451641b01a632455fb \
  bash .agent-skills/underworld-overseer-save-mapper/scripts/setup.sh --install
```

## Best practices

1. Back up saves and use redacted fixtures for bug reports.
2. Validate structure and coordinate uniqueness before diagnosing HTML.
3. Keep dependency installation isolated in a virtual environment.
4. Pin an upstream commit for reproducible output.
5. Treat the generated HTML as local data because descriptors and layout may reveal game progress.

## References

- `references/upstream.md` — inspected commit, behavior, dependencies, and license caveat.
- [Upstream repository](https://github.com/RobThePCGuy/Underworld-Overseer-Save-Mapper)
