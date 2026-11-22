# Expert tools

Read this before editing anything under `skills/dcc/` or `skills/game-engines/`.
[AGENTS.md](../AGENTS.md) says what the tier is; this file lists how the authoring contract differs
for it.

The authoring contract applies with these differences, because the tier drives an application rather
than the MCP server:

- The MCP rules (MCP as the surface, `recommend` discovery, model ids) do not apply. The rest does,
  including the frontmatter, the 2500-word cap, house style, public content only, and the
  sibling-install sentence.
- In place of the tool reference, an application fact comes from the application's own documentation
  or source, or a plugin's public guide.
  - Read a value or feature-detect a call rather than assert a version or a default.
  - Code not yet run in the application carries the family's marker (`[verify]`, or "not yet run in
    <app>").
- Descriptions follow the spec's 1024-character cap, not the 500-character target. Bodies may pass
  the 1000-word target. Both are the author's choice, kept until a live run shows what to trim.
  - Draft a body to about 2300 words, so review fixes fit under the 2500 cap. A body already past
    2300 trims before it grows.
- Shipped scripts need no suite of their own under `tests/<name>/`: the behavior suites live in the
  author's build project and run against the application.
  - One suite per family, `tests/scenario-<app>-expert/` (the same file in each), imports every
    script with system Python and checks that each skill name a script uses to find the lead's
    `scripts/` exists. `pnpm skill-files` still parses every Python script.
  - Blender, Godot, Unity, and Roblox each have a workflow, `.github/workflows/<app>.yml`. It runs
    on a PR or a push to `main` that changes the family's scripts, its
    `tests/scenario-<app>-expert/` suite, or the workflow file itself, and on manual dispatch.
  - Blender's `tests/scenario-blender-expert/test_live_gate.py` runs the delivery gate in a real
    Blender against planted defects. `blender.yml` runs it on Linux only; the gate has no per-OS
    branch. Without Blender installed it skips.
  - Godot also runs the application, on every OS: its toolkit branches per OS (locks, the process
    table, copies). `tests/scenario-godot-expert/test_toolkit_live.py` runs against a real Godot on
    Linux, macOS, and Windows in `godot.yml`. Without Godot installed its live tests skip; its lock
    and GUI-check tests still run in `pnpm test`.
  - Blender's live suites (`tests/scenario-blender-expert/test_live_*.py`) run Blender headless
    against fixtures with known answers. `blender.yml` installs the release the skills were verified
    on, and fails if a live suite skips. Without Blender, or with a release below the family's 5.2
    floor, they skip in `pnpm test`, naming the version found.
  - Unity's `tests/scenario-unity-expert/test_toolkit_offline.py` needs no application: it runs the
    toolkit's lock probe, process-table parsing, and signal handling in `pnpm test`. `unity.yml`
    runs it on macOS, the OS the toolkit targets.
  - Roblox has no Studio in CI. `tests/scenario-roblox-expert/` runs AgentKit modules under Lune
    with fake engine services (`lune/`), and builds places with Rojo to read back with Lune
    (`test_live_rojo.py`). `roblox.yml` installs the Lune and Rojo versions the tooling skill pins,
    and fails if those suites skip. Without the tools they skip in `pnpm test`.
  - Offline suites (`test_*_offline.py`) in every family run host-side helpers with no application
    installed: file and log handling, locks, CLI entry points. A stand-in child process replaces the
    editor where one is spawned. Their leak checks fail on a handle left open, so a later edit
    cannot reopen one unnoticed.
- A link to a subfolder (`scripts/AgentKit/`, never `scripts/` itself) covers the files under it:
  these skills ship code trees an agent copies into a project whole.
- cspell skips code, fenced and inline, and YouTube video ids. Prose is checked as everywhere else
  (`cspell.json` overrides).
- Each family is one `skills.sh.json` grouping titled "Expert tools: <app>". Every expert grouping
  comes after every core grouping, so the expert tools stay at the bottom of skills.sh and the
  installer picker (`pnpm groupings` enforces both). A new core grouping goes above them, which
  renumbers their plugin ids.
- The [application test protocol](application-test.md) grades MCP plans. For an expert tool, grade
  the plan against the lead skill's execution channels and the application's own documentation
  instead.
