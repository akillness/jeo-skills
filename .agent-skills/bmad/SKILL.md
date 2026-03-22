---
name: bmad
description: Orchestrates BMAD workflows for structured AI-driven development. Routes work across Analysis, Planning, Solutioning, and Implementation phases.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: bmad, orchestrator, workflow, planning, implementation
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: bmad
  version: 1.2.0
  source: user-installed skill
---


# bmad - BMAD Workflow Orchestration

## When to use this skill

- Initializing BMAD in a new project
- Checking and resuming BMAD workflow status
- Routing work across Analysis, Planning, Solutioning, and Implementation
- Managing structured handoff between phases

---

## Installation

```bash
npx skills add https://github.com/supercent-io/skills-template --skill bmad
```

## Notes for Codex Usage

`bmad`'s default execution path is Claude Code.
To run the same flow directly in Codex, we recommend operating BMAD stages via a higher-level orchestration path such as `omx`/`ohmg`.

## Control Model

BMAD phase routing should be treated with the same three-layer abstraction used by OMG:

- `settings`: platform-specific runtime configuration such as Claude hooks, Codex/Gemini instructions, and MCP setup
- `rules`: phase constraints such as "do not advance before the current phase document is approved" and "do not reopen the same unchanged phase document for review"
- `hooks`: platform callbacks such as Claude `ExitPlanMode`, Codex `notify`, or Gemini `AfterAgent`

For BMAD phase gates, the intended rule is strict:

- review the current phase document before moving forward
- if the document hash has not changed since the last terminal review result, do not relaunch plannotator
- only a revised document resets the gate and permits another review cycle

---

## BMAD Execution Commands

## Platform Support Status (Current)

| Platform | Current support mode | Requirements |
|---|---|---|
| Gemini CLI | Native (recommended) | Register the `bmad` keyword, then run `/workflow-init` |
| Claude Code | Native (recommended) | Install skill + `remember` pattern |
| OpenCode | Orchestration integration | Use an `omx`/`ohmg`/`omx`-style bridge |
| Codex | Orchestration integration | Use an `omx`/`ohmg`-style bridge |

Possible with `this skill alone`:
- Gemini CLI/Claude Code: **Yes**
- OpenCode/Codex: **Yes (via orchestration)**

Use these in your AI session:

```text
/workflow-init
/workflow-status
```

Typical flow:

1. Run `/workflow-init` to bootstrap BMAD config.
2. Move through phases in order: Analysis -> Planning -> Solutioning -> Implementation.
3. Run `/workflow-status` any time to inspect current phase and progress.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Initialize BMAD | `/workflow-init` |
| Check BMAD status | `/workflow-status` |


---

## plannotator Integration (Phase Review Gate)

Each BMAD phase produces a key document (PRD, Tech Spec, Architecture). Before transitioning to the next phase, review that document with **plannotator** and auto-save it to Obsidian.

### Why use plannotator with BMAD?

- **Quality gate**: Approve or request changes before locking in a phase deliverable
- **Obsidian archive**: Every approved phase document auto-saves with YAML frontmatter and `[[BMAD Plans]]` backlink
- **Team visibility**: Share a plannotator link so stakeholders can annotate the PRD/Architecture before implementation begins

### Phase Review Pattern

After completing any phase document, submit it for review:

```bash
# After /prd → docs/prd-myapp-2026-02-22.md is created
bash scripts/phase-gate-review.sh docs/prd-myapp-2026-02-22.md "PRD Review: myapp"

# After /architecture → docs/architecture-myapp-2026-02-22.md is created
bash scripts/phase-gate-review.sh docs/architecture-myapp-2026-02-22.md "Architecture Review: myapp"
```

Or submit the plan directly from within your AI session:

```text
# In Claude Code after /prd completes:
planno — review the PRD before we proceed to Phase 3
```

The agent will open the plannotator UI for review. In Claude Code: call `EnterPlanMode` → write plan → call `ExitPlanMode` (hook fires automatically). In OpenCode: the `submit_plan` plugin tool is available directly.

### Phase Gate Flow

```
/prd completes → docs/prd-myapp.md created
       ↓
 bash scripts/phase-gate-review.sh docs/prd-myapp.md
       ↓
 hash guard checks whether this exact document was already reviewed
       ↓
 unchanged hash? yes → keep previous terminal result, do not reopen UI
       ↓ no
 plannotator UI opens in browser
       ↓
  [Approve]              [Request Changes]
       ↓                        ↓
 Obsidian saved          Agent revises doc
 bmm-workflow-status     Re-submit for review
 updated automatically
       ↓
 /architecture (Phase 3)
```

### Obsidian Save Format

Approved phase documents are saved to your Obsidian vault with:

```yaml
---
created: 2026-02-22T22:45:30.000Z
source: plannotator
tags: [bmad, phase-2, prd, myapp]
---

[[BMAD Plans]]

# PRD: myapp
...
```

### Quick Reference

| Phase | Document | Gate Command |
|-------|----------|--------------|
| Phase 1 → 2 | Product Brief | `bash scripts/phase-gate-review.sh docs/product-brief-*.md` |
| Phase 2 → 3 | PRD / Tech Spec | `bash scripts/phase-gate-review.sh docs/prd-*.md` |
| Phase 3 → 4 | Architecture | `bash scripts/phase-gate-review.sh docs/architecture-*.md` |
| Phase 4 done | Sprint Plan | `bash scripts/phase-gate-review.sh docs/sprint-status.yaml` |

---

## TEA Integration (Test Architect)

TEA (Test Architect) is an official BMAD v6 external module providing enterprise-grade test strategy and quality gates across all phases. See `resources/tea-workflows.md` for full workflow reference.

### TEA Integration Points

| Phase | TEA Workflow | Command | Level |
|-------|-------------|---------|-------|
| Phase 2: Planning | NFR Assessment | `/tea-nfr` | Level 3+ required |
| Phase 3: Solutioning | Test Design | `/tea-test-design` | Level 2+ recommended |
| Phase 3: Solutioning | Framework Setup | `/tea-framework` | Level 2+ recommended |
| Phase 3: Solutioning | CI Integration | `/tea-ci` | Level 2+ recommended |
| Phase 4: Implementation | ATDD | `/tea-atdd` | Per epic |
| Phase 4: Implementation | Test Automation | `/tea-automate` | Per epic |
| Phase 4: Implementation | Test Review | `/tea-review` | Level 2+ required |
| Phase 4: Implementation | Requirements Tracing | `/tea-trace` | Level 3+ required |
| Release Gate | Go/No-Go Decision | `/tea-release-gate` | Level 2+ required |

### TEA Risk Prioritization

TEA uses risk-based test prioritization: **P0** (critical) → **P1** (high) → **P2** (medium) → **P3** (low), calculated from probability × impact.

---

## SSD — Spec-Driven Development Path

SSD (Spec-Driven Development) enforces a spec-first approach: formal machine-readable specifications must be created in Phase 2 **before** Architecture work begins.

### SSD Workflow Commands

| Command | Output | When |
|---------|--------|------|
| `/spec-openapi` | OpenAPI 3.x spec (docs/spec-openapi-*.yaml) | API projects, Phase 2 |
| `/spec-schema` | JSON Schema definitions (docs/spec-schema-*.json) | Data-heavy projects, Phase 2 |
| `/spec-bdd` | Gherkin feature files (docs/stories/*.feature) | All Phase 4 stories |

### SSD Workflow Path (Level 2+)

```
Phase 2: PRD → /spec-openapi or /spec-schema → plannotator gate
Phase 3: Architecture (references spec) → /spec-bdd scenarios
Phase 4: Dev Story implements spec + passes BDD scenarios
```

### SSD in Tech Spec (Level 0-1)

For smaller projects, embed specs inline:
- Include API contract section in Tech Spec
- Define acceptance criteria as Given/When/Then scenarios
- Reference spec file path in story blockedBy

---

## Fabric Pattern Integration

Use [fabric](https://github.com/danielmiessler/fabric) CLI to analyze and improve BMAD phase documents at each gate.

### Per-Phase Fabric Commands

```bash
# Phase 1 — Extract insights from product brief
cat docs/product-brief-*.md | fabric -p analyze_paper --stream

# Phase 2 — Review PRD for completeness
cat docs/prd-*.md | fabric -p extract_wisdom --stream

# Phase 3 — Summarize architecture decisions
cat docs/architecture-*.md | fabric -p create_summary

# Phase 4 — Explain implementation changes
git diff HEAD~1 | fabric -p explain_code

# Improve any phase document before review
cat docs/prd-*.md | fabric -p improve_writing > docs/prd-improved.md
```

### Integration with plannotator Gate

Before submitting a document to plannotator for phase gate review, run fabric to improve it:

```bash
# Run fabric improvement, then gate review
cat docs/architecture-*.md | fabric -p improve_writing > /tmp/arch-improved.md
bash scripts/phase-gate-review.sh /tmp/arch-improved.md "Architecture Review"
```

See `resources/fabric-patterns.md` for complete pattern reference.
