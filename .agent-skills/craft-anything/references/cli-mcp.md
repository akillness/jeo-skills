# Craft Anything CLI and MCP Server Reference

The `craft-anything-cli` executable serves dual roles: a standalone command-line reverse engineering and rebuilding tool, and an MCP server that exposes 320 tools to agent runtimes over stdio.

## Global Options

```text
craft-anything-cli [OPTIONS] <COMMAND>

Options:
  --format <FORMAT>        Output format: json, text, md (alias: --output-format) [default: json]
  --json                   Shorthand for --format json
  --project <PATH>         Project folder (*.cany): evidence, memory, and journal stored here
  --allow-run              Allow tools that run code or change a device without interactive prompts
  --deep                   Deep mode for this run: tools may read internal code, files, page source
  --clean-room             Enforce clean room for this run: nothing inside the target is read
  -h, --help               Print help
  -V, --version            Print version
```

## Subcommands Overview

| Command | Usage | Description |
|---|---|---|
| `mcp` | `craft-anything-cli mcp [options]` | Runs the stdio MCP server for agent runtimes |
| `rebuild` | `craft-anything-cli rebuild <target> "<req>"` | Full Study → Build → Check → Ready rebuild workflow |
| `setup` | `craft-anything-cli setup [options]` | Configures coding-agent clients (Claude Code, Codex, Cursor, etc.) |
| `doctor` | `craft-anything-cli doctor [--client <id>]` | Diagnostics for installed clients, engines, and MCP server |
| `uninstall` | `craft-anything-cli uninstall` | Removes Craft Anything's registrations and skill files |
| `commands` | `craft-anything-cli commands` | Lists all 320 tools grouped by toolset |
| `capabilities`| `craft-anything-cli capabilities` | Reports toolsets, engine readiness, and platform capabilities |
| `triage` | `craft-anything-cli triage <path>` | Opens a file and performs an initial static analysis |
| `report` | `craft-anything-cli report [path] [--html]` | Writes an investigation report from evidence and findings |
| `chat` | `craft-anything-cli chat [options]` | Streams agent Q&A regarding a target to stdout |
| `ai` | `craft-anything-cli ai <subcommand>` | Manages configured AI backends (`list`, `detect`, `add`, etc.) |

## MCP Server Configuration

When launching the MCP server for an agent runtime:

```bash
craft-anything-cli mcp [OPTIONS]
```

### Key MCP Flags:
- `--all-tools`: Exposes all 320 tools rather than just the core essentials.
- `--restricted`: Restricts high-privilege capabilities; disables machine-acting tools and turns off web/capture tools by default.
- `--allow-web`: Re-enables web inspection tools (`web_site_open`, etc.) under restricted mode.
- `--allow-capture`: Re-enables screen/window capture tools under restricted mode.
- `--inbox <dir>`: Sets a directory where human approval cards (`core_action_approve`) and questions (`core_person_ask`) are deposited.
- `--target <JSON>`: Passes pre-configured target metadata from the desktop app.

### CRITICAL Setup Warning:
Never run `craft-anything-cli setup --yes` against an existing client entry that already specifies `--all-tools`. The default `setup` command writes plain `mcp` without `--all-tools`, which would silently downgrade the agent's tool catalog to the core-only subset. To add or adjust entries, preview with `setup --dry-run` or configure manually.

## Toolsets and Dynamic Enabling

By default, the MCP server advertises the **Core** toolset. Additional toolsets can be queried and enabled dynamically during an investigation:

| Toolset | Key Capabilities |
|---|---|
| `core` | Session state, project files, investigation lifecycle, evidence storage, person inbox |
| `native` | ELF, PE, Mach-O inspection, disassembly, decompilation, imports/exports, Ghidra bridge |
| `javascript` | Electron app parsing, `.asar` extraction, JavaScript bundle analysis, AST exploration |
| `android` | APK package analysis, DEX disassembly, AndroidManifest.xml inspection, resource extraction |
| `managed` | .NET assemblies, CIL instructions, metadata tables, PDB symbols |
| `formats` | WebAssembly modules, Go symbol tables, PE resource trees, firmware images, crash dumps |
| `web` | Live web site inspection, responsive page layout measurements (desktop/tablet/mobile) |
| `capture` | Window discovery, window screenshots, active desktop observation |
| `application` | Multi-version application diffing, binary similarity comparisons |

Tools for managing toolsets:
- `list_toolsets`: Returns all available toolsets and their active/enabled status.
- `enable_toolset {"name": "<toolset>"}`: Activates a toolset for the current session.

## Working Memory and Evidence Tools

To ensure investigations survive context resets, use these core memory tools:

- `core_investigation_show`: Reads the current investigation brief, plan, hypotheses, and handoff note.
- `core_brief_write`: Establishes the objective, scope, constraints, and target definitions.
- `core_plan_update`: Maintains an ordered step list with status (`todo`, `doing`, `done`, `blocked`).
- `core_hypothesis_record`: Records a falsifiable claim and the prediction that would test it.
- `core_hypothesis_update`: Updates a hypothesis (`supported`, `refuted`, `abandoned`) with evidence IDs.
- `core_finding_record`: Records a verified statement anchored to one or more `ev_...` evidence IDs.
- `core_handoff_write`: Writes a concise handoff briefing for subsequent sessions or human review.
- `core_journal_read`: Reviews historical tool calls and findings across the investigation.
- `core_evidence_browse`: Paginates through stored evidence records in `investigation.cany/evidence/`.
- `core_unknown_add`: Formally registers an unanswered question or unexplored boundary.
