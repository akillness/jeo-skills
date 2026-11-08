# Craft Anything Rebuild Workflow Reference

The `rebuild` command automates the end-to-end transformation of an existing website, desktop application, or game into an independent, clean-room implementation built by an AI coding agent.

## The 4-Phase Lifecycle

```text
Target (Website / App / Game / Prompt)
  │
  ▼
[ 1. STUDY ] ─── Inspect original: layout at 3 widths (1280px, 768px, 375px),
  │              visible text, menus, colors, spacing, and interaction states.
  ▼
[ 2. BUILD ] ─── Coding agent (Claude Code / Copilot / Grok) scaffolds a new
  │              project in the requested language, framework, or game engine.
  ▼
[ 3. CHECK ] ─── Automated visual & functional checks compare the build against
  │              the original and produce difference scores and missing item lists.
  ▼
[ 4. READY ] ─── Launch, play, or preview the result; accept iterations via
                 follow-up messages until the target is closely matched.
```

## Command Line Syntax

```bash
craft-anything-cli rebuild <TARGET> "<REQUEST>" [OPTIONS]
```

### Positional Arguments
- `<TARGET>`:
  - Web URL: `https://example.com`
  - Application binary or bundle: `/Applications/Calculator.app` or `C:\Games\Game.exe`
  - Prompt-only (no original software to inspect): `-`
- `<REQUEST>`: A clear description of what to build (e.g. `"Recreate this landing page with Next.js and Tailwind CSS"`, `"Recreate this snake game in Rust with macroquad"`).

### Rebuild Options and Flags

| Option | Flag | Description |
|---|---|---|
| Projects Directory | `--projects-dir <dir>` | Directory where new project folders are created (defaults to settings `projects_dir`) |
| Specific Project Folder | `--project-folder <dir>` | Target directory for the new project (conflicts with `--continue-in`) |
| Existing Files Handling | `--existing [edit\|start-from]` | With `--project-folder` containing files: `edit` (modify in place) or `start-from` (build in `app/` beside existing files) |
| Continue Session | `--continue-in <dir>` | Continue work in an existing project folder; request becomes a follow-up refinement prompt |
| Resume Session | `--resume` | Resume where an interrupted or paused run stopped (requires `--continue-in`) |
| Coding Agent Backend | `--backend <agent>` | Agent backend name (e.g. `"Claude Code"`, `"GitHub Copilot"`, `"Grok"`) |
| Refinement Iterations | `--rounds <N>` | Number of refinement passes after initial build (default: `2`) |
| Unattended Mode | `--unattended` | Non-interactive operation: auto-answers questions with first option and refuses external approvals |
| Target Engine / Stack | `--build-with <engine>` | Specific engine or stack name: `rust`, `godot`, `unity`, `unreal`, or full stack identifier |
| Generative AI Assets | `--generate-assets` | Allows builder to generate images and 3D models via fal.ai within the configured asset budget |

## Project Directory Layout

Every rebuild project is structured in a self-contained folder:

```text
MyProject/
├── craft.json                  # Master manifest: name, target object, request, status, stack, checks
├── capture/                    # Harvested artifacts from target: screenshots, state DOM, harvested layout
│   ├── desktop_1280.png
│   ├── tablet_768.png
│   ├── mobile_375.png
│   └── site_metadata.json
├── app/                        # Clean-room source code produced by the coding agent
│   ├── Cargo.toml / package.json
│   └── src/
├── checks/                     # Check artifacts comparing app against capture, one folder per round
│   └── round-1/
│       ├── build.log
│       └── visual_diff_desktop.png
├── investigation.cany/         # Evidence, memory and journal (a regular project)
│   ├── project.toml
│   └── evidence/
└── inbox/                      # Human approval requests and user questions
    ├── <id>.request.json       # Pending question or approval request waiting for answer
    └── <id>.answer.json        # Answer file written by user/app (consumed by asker)

## `craft.json` Manifest Format

The `craft.json` file records the project's metadata:

```json
{
  "version": 3,
  "name": "example-landing-page",
  "request": "Recreate this landing page in pure HTML and Tailwind CSS",
  "target": {
    "kind": "website",
    "url": "https://example.com"
  },
  "stack": "html-tailwind",
  "status": "ready",
  "note": "",
  "created_ms": 1794098000000,
  "updated_ms": 1794098080000,
  "builder": "Claude Code",
  "asset_budget_usd": 5.0,
  "generate_assets": false,
  "checks": [
    {
      "round": 1,
      "check": "web-visual",
      "passed": true,
      "similarity": 94.0,
      "note": "Visual check: 94% desktop alignment, 91% mobile alignment",
      "artifacts": [],
      "at_ms": 1794098080000
    }
  ]
}
```

> **Note on Clean room:** Clean room vs Deep mode is a runtime engine session setting (enabled by default; toggled via `--deep` on CLI or in app settings), not a serialized field in `craft.json`.

## Human-in-the-Loop & Approval Cards

During automated builds, the coding agent or engine may require human input via `inbox/`:
- **Inbox protocol:** Requests are posted atomically as `<id>.request.json` with `kind: "question"` (from `core_person_ask`) or `kind: "approval"` (from `core_action_approve`). A request is pending if `<id>.request.json` exists without a matching `<id>.answer.json`.
- **Answering requests:** The desktop app or `project_inbox_answer` writes `<id>.answer.json` with `allow` (`true`/`false`), `always` (`true` to remember for this action kind), `choice`, and/or `text`. Once the asker reads the answer, both files are cleaned up.
- **Action approvals (`core_action_approve`):** For commands that run package managers (`npm install`, `cargo build`), modify outside files, or change system settings. With `--unattended`, approvals fail closed (are rejected) to ensure untrusted code is not run without human consent.
