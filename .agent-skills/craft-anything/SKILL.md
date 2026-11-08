---
name: craft-anything
description: >
  Operate storytold/craft-anything, the open-source pure-Rust clean-room software reverse engineering and AI rebuilding engine, its desktop app, `craft-anything-cli`, and MCP server. Use when a user asks to inspect how shipped software works (binaries, Electron/JS, Android APK, .NET, WebAssembly, firmware, packet captures), run clean-room or deep analysis, execute `craft-anything-cli rebuild` to study and rebuild software with coding agents (Claude Code, Copilot, Grok), run `craft-anything-cli doctor/setup/mcp`, manage investigation memory (briefs, plans, hypotheses, findings, handoffs), or inspect source-pinned checkouts. Keep code execution, device changes, live network targets, and agent configuration writes approval-gated. Route generic repository searches to `codebase-search` and browser automation to `browser`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Requires Rust 1.97+ for source builds, or installed `craft-anything` / `craft-anything-cli`
  desktop/CLI release for macOS, Windows, Linux, or FreeBSD. Coding agent integration requires
  a signed-in local agent CLI (Claude Code, GitHub Copilot CLI, Grok Build).
license: MIT OR Apache-2.0
metadata:
  version: "0.4.0"
  source: https://github.com/storytold/craft-anything
  upstream_commit: 56aa31976b4ff0950e6b34ba020b0a568d2462fa
---

# Craft Anything operator

## When to use this skill

Use Craft Anything when an answer or rebuild depends on software that was **built and shipped**:
- Shipped executables and libraries (ELF, PE, Mach-O), WebAssembly, Go symbols, or firmware.
- Packaged desktop apps: Electron apps, `.asar` archives, JavaScript bundles, or .NET assemblies.
- Mobile packages: Android APKs, DEX code, manifests, and packaged resources.
- Live network packet captures, crash dumps, or sqlite/database files.
- Rebuilding software from an existing website, app, or game using a clean-room workflow where an AI coding agent creates an independent implementation in Rust, Godot, Unity, Unreal, or web stacks.
- Operating the `craft-anything-cli` command-line tool, stdio MCP server, or desktop workbench.

**When NOT to use this skill:**
- If you already have the source code and the question is answered by reading the source, use normal repository tools (`codebase-search`, `grep`, `read`).
- For generic browser automation on already-logged-in sessions, route to `playwriter` or `browser`.
- For standard debugging of local project bugs, route to `debugging`.

## Clean room versus Deep mode

Craft Anything enforces a strict operational distinction:
- **Clean room (default):** Nothing inside the target program is read — no source, internal bytecode, decompiled functions, or private assets. Craft Anything works exclusively from externally observable facts: screenshots, measured layout, colors, fonts, spacing, and open windows. Tools that inspect internals are refused and return `details.reason: clean_room`.
- **Deep mode:** Reads internal code, disassembles, decompiles, inspects JavaScript bundles, and connects to Ghidra when installed. Deep mode is for software you own or are explicitly authorized to examine. Activate with `--deep` on the CLI or `settings_set deep_mode true` in the app.

## Instructions

1. **Run the offline gate first.**
   Run the bundled preflight script before attempting upstream execution:
   ```bash
   python3 .agent-skills/craft-anything/scripts/preflight.py --json
   ```
   Add `--repo PATH --expect-commit 56aa31976b4ff0950e6b34ba020b0a568d2462fa` when checking a supplied source checkout. Preflight is read-only, makes no network requests, and never executes unverified binaries.

2. **Fit-check the installation and tools.**
   Read [references/upstream.md](references/upstream.md) and [references/cli-mcp.md](references/cli-mcp.md). Check if `craft-anything-cli` is installed:
   ```bash
   craft-anything-cli --version
   craft-anything-cli doctor
   craft-anything-cli capabilities
   ```
   If building from source, verify Rust 1.97+ (`cargo --version`, `rustc --version`). On Debian/Ubuntu desktop builds, ensure required GTK/Wayland system libraries are installed.

3. **Rebuild targets deliberately (Study → Build → Check → Ready).**
   Read [references/rebuild-workflow.md](references/rebuild-workflow.md).
   To study an existing target and have a coding agent rebuild it:
   ```bash
   craft-anything-cli rebuild <target> "<request>" [options]
   ```
   - Target can be a web URL (`https://...`), an absolute application/file path, or `-` for a prompt-only build.
   - Refinement rounds: `--rounds 2` (default).
   - Coding agents: `--backend "Claude Code"` (or Copilot, Grok).
   - Target engines: `--build-with <engine>` (e.g. `godot`, `unity`, `unreal`, `rust`).
   - Project location: `--project-folder <dir>` or `--continue-in <dir>` to resume/iterate.
   - Unattended mode: `--unattended` auto-answers questions with first choice and refuses external approvals.

4. **Serve MCP tools safely.**
   To provide Craft Anything's 320 tools to an agent client:
   ```bash
   craft-anything-cli mcp --all-tools
   ```
   - Shared host restriction: `--restricted` disables machine-acting tools.
   - Selectively enable capabilities: `--allow-web`, `--allow-capture`.
   - Provide an inbox for human approvals: `--inbox <dir>`.
   - Setup client configuration: always run `craft-anything-cli setup --dry-run` first to preview changes.
   - **CRITICAL:** Never run `setup --yes` over an entry that already carries `--all-tools`, as plain `setup` writes the core-only command and drops `--all-tools`.

5. **Maintain durable investigation memory.**
   When conducting manual or multi-step investigations, persist state across context boundaries:
   - Start/resume: call `core_investigation_show` and `core_session_show`.
   - Define scope: write brief (`core_brief_write`) and initial plan (`core_plan_update`).
   - Test hypotheses: record predictions (`core_hypothesis_record`), then verify (`core_hypothesis_update`).
   - Settle findings: record findings with evidence IDs (`core_finding_record`).
   - Handoff note: write `core_handoff_write` at the end of every turn.
   - Inspect project artifacts with `python3 .agent-skills/craft-anything/scripts/project_inspect.py inspect <dir>`.

6. **Gate consent and side effects.**
   - Tools that run target code or change devices require explicit user approval (`consent_required`).
   - AI generation of pictures or 3D models with fal.ai (`--generate-assets`) incurs API costs and requires explicit budget consent.
   - Installing dependencies during rebuilds (`npm`, `cargo`) executes external code; always review commands before approving.
   - For troubleshooting, read [references/recovery.md](references/recovery.md).

## Examples

### Example 1: Offline preflight check
```bash
python3 .agent-skills/craft-anything/scripts/preflight.py --json \
  --repo /path/to/craft-anything \
  --expect-commit 56aa31976b4ff0950e6b34ba020b0a568d2462fa
```

### Example 2: Clean-room website rebuild
```bash
craft-anything-cli rebuild https://example.com "Recreate this landing page in pure HTML and Tailwind CSS" \
  --rounds 2 \
  --project-folder ~/Documents/Craft\ Anything/example-site
```

### Example 3: Rebuilding a game in Rust
```bash
craft-anything-cli rebuild - "A classic arcade snake game in Rust with macroquad" \
  --build-with rust \
  --rounds 1 \
  --project-folder ~/Documents/Craft\ Anything/snake-game
```

### Example 4: Validating an existing project folder
```bash
python3 .agent-skills/craft-anything/scripts/project_inspect.py validate \
  ~/Documents/Craft\ Anything/example-site --json
```

## Best practices

- **Distinguish observation, derivation, and inference:** Direct bytes and captures are observed; call graphs and CFGs are derived; intent and names are inferred. Label every claim.
- **Always cite Evidence IDs (`ev_...`):** Every finding must link to stored evidence records in `investigation.cany/`.
- **Clean room by default:** Default to clean-room analysis for external software. Only switch to Deep mode when internal inspection is explicitly authorized.
- **Never bypass approval gates:** Do not automate away `core_action_approve` or `consent_required` dialogs.
- **Respect trademark and licensing limits:** ArtCraft brand marks in `docs/brand/` are proprietary trademarks; rebuild outputs must not duplicate protected brand names, logos, or commercial assets.

## References

- [Pinned upstream reference](references/upstream.md) — source commit, architecture, toolsets, and platform notes.
- [CLI and MCP server reference](references/cli-mcp.md) — subcommands, toolsets, and MCP flags.
- [Rebuild workflow reference](references/rebuild-workflow.md) — Study → Build → Check → Ready pipeline.
- [Connection and recovery reference](references/recovery.md) — troubleshooting and setup recovery.
- [Upstream repository](https://github.com/storytold/craft-anything/tree/56aa31976b4ff0950e6b34ba020b0a568d2462fa)
