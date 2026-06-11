# cli-anything command and platform reference

Upstream: <https://github.com/HKUDS/CLI-Anything> · Hub: <https://hkuds.github.io/CLI-Anything/>

## CLI-Hub package manager (`cli-hub`)

| Command | Purpose |
|---------|---------|
| `pip install cli-anything-hub` | Install the package manager |
| `cli-hub list` | Browse the registry |
| `cli-hub search <keyword>` | Search by keyword |
| `cli-hub info <name>` | Inspect one CLI |
| `cli-hub install <name>` | Install from CLI-Hub |
| `cli-hub update <name>` | Update an install |
| `cli-hub uninstall <name>` | Remove an install |
| `cli-hub launch <name> [args...]` | Run an installed CLI |

v0.2.0+ supports public CLIs from multiple install sources (`pip`, `npm`,
`brew`, bundled/system tools) via `public_registry.json`.

## Agent meta-skill (autonomous discovery)

```bash
npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y
# Per-harness skills are also listable:
npx skills add HKUDS/CLI-Anything --list
```

Also published on ClawHub, SkillHub, and SkillHub.cn.

## Generator commands (run inside the agent platform)

| Command | Purpose |
|---------|---------|
| `/cli-anything <path-or-repo>` | Build a complete CLI harness — all 7 phases |
| `/cli-anything:refine <path> [focus]` | Gap analysis + incremental coverage expansion |
| `/cli-anything:test <path>` | Run tests and update `TEST.md` |
| `/cli-anything:validate <path>` | Validate against `HARNESS.md` standards |
| `/cli-anything:list [options]` | List generated tools (Pi extension) |

7-phase pipeline: Analyze → Design → Implement (Click + REPL + JSON +
undo/redo) → Plan Tests → Write Tests → Document (+ 6.5 SKILL.md
generation via `skill_generator.py`) → Publish (`setup.py`, PATH).

## Platform install matrix

| Platform | Install |
|----------|---------|
| **Claude Code** | `/plugin marketplace add HKUDS/CLI-Anything` → `/plugin install cli-anything` |
| **Codex** | `git clone https://github.com/HKUDS/CLI-Anything.git && bash CLI-Anything/codex-skill/scripts/install.sh` (→ `~/.codex/skills/cli-anything`; PowerShell: `install.ps1`) |
| **OpenCode** | `cp CLI-Anything/opencode-commands/*.md ~/.config/opencode/commands/` + `cp CLI-Anything/cli-anything-plugin/HARNESS.md ~/.config/opencode/commands/` (older builds use `command/`) |
| **OpenClaw** | `cp CLI-Anything/openclaw-skill/SKILL.md ~/.openclaw/skills/cli-anything/SKILL.md` → `@cli-anything build a CLI for ./gimp` |
| **Pi** | `bash CLI-Anything/.pi-extension/cli-anything/install.sh` (→ `~/.pi/agent/extensions/`; `--uninstall` to remove) |
| **Hermes** | `bash CLI-Anything/hermes-skill/scripts/install.sh` (→ `$HERMES_HOME/skills/cli-anything-hermes`) |
| **Qodercli** | `bash CLI-Anything/qoder-plugin/setup-qodercli.sh` (registers in `~/.qoder.json`) |
| **GitHub Copilot CLI** | `copilot plugin install ./cli-anything-plugin` |
| **Goose** | Configure a CLI provider (e.g. Claude Code), then use the provider's commands |

Claude Code troubleshooting (`Unknown skill: cli-anything`):
`/reload-plugins` → `/help cli-anything` → reinstall from marketplace →
legacy form `/cli-anything:cli-anything` only on older builds.
Windows: requires Git for Windows (`bash` + `cygpath`) or WSL.

## Generated harness usage

```bash
cd <software>/agent-harness && pip install -e .   # installs cli-anything-<name> on PATH

cli-anything-<name> --help        # self-describing
cli-anything-<name> --json <cmd>  # structured output for agents
cli-anything-<name>               # bare command enters stateful REPL

# Tests (force-installed mode recommended for validation)
CLI_ANYTHING_FORCE_INSTALLED=1 python3 -m pytest cli_anything/<name>/tests/ -v -s
```

## Harness catalog (selected, 40+ total — 2,461 tests, 100% pass)

Creative/media: GIMP (107) · Blender (208) · Inkscape (202) · Audacity (161) ·
Krita · Kdenlive (155) · Shotcut (154) · Openscreen (101) · OBS Studio (153) ·
MuseScore (56) · VideoCaptioner (26) · Sketch (19)
Office/knowledge: LibreOffice (158) · Zotero · Calibre (58) · Joplin (134) ·
Mubu (96) · Obsidian · NotebookLM (21)
Diagrams/GIS/CAD: Draw.io (138) · Mermaid (10) · QGIS (22) · FreeCAD ·
3MF (50) · CloudCompare (88) · CloudAnalyzer (14)
AI/dev/infra: ComfyUI (70) · Ollama (98) · Exa (40) · n8n · Dify Workflow (11) ·
Mailchimp (303 cmds) · AdGuard Home (36) · WireMock · ETH2 QuickStart (18) ·
LLDB (27) · RenderDoc (59) · Nsight Graphics (51) · Unreal Insights (50)
Games: Godot (24) · s&box (244) · Slay the Spire II
Comms: Zoom (22) · Browser (DOMShell MCP)

## Design principles (from HARNESS.md)

1. **Authentic integration** — generate valid project files (ODF, MLT XML,
   SVG), delegate rendering to the real application; interfaces TO software,
   not replacements.
2. **Dual interaction** — stateful REPL for agent sessions + subcommands for
   pipelines; bare command enters REPL.
3. **Agent-native output** — `--json` on every command; discovery via
   `--help` and `which`.
4. **Zero-compromise backends** — real software is a hard requirement;
   tests fail (not skip) when backends are missing.
5. **Verify artifacts** — magic bytes, ZIP/OOXML structure, pixel/audio
   analysis, duration checks — never trust exit code 0.

## Limitations

- Harness generation needs frontier-class models; weaker models produce
  incomplete CLIs.
- Works from source code; binary-only targets degrade substantially.
- One generation pass rarely covers everything — plan for `/cli-anything:refine`.
