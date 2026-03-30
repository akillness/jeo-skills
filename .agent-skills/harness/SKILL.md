---
name: harness
description: >
  Design and scaffold a domain-specific harness: specialized agent teams,
  role definitions, orchestration skills, and validation loops. Use when the
  user asks to build a harness, design an agent team, scaffold project-specific
  agents/skills, or adapt revfactory/harness concepts across Claude Code,
  Codex CLI, Gemini / Antigravity, OpenCode, Pi, Claw, and similar platforms.
  Triggers on: harness, build a harness, harness engineering, agent team
  architect, scaffold agents, scaffold skills, design an agent team.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Best native fit is Claude Code Agent Teams. Codex, Gemini, OpenCode, Antigravity, Pi, and Claw-style systems should use adapter-mode guidance from bundled references.
license: Apache-2.0
metadata:
  tags: harness, agent-team, meta-skill, orchestration, scaffolding, claude, codex, gemini, opencode, antigravity, claw, pi
  version: "1.0.0"
  source: revfactory/harness
---

# harness - Agent Team & Skill Architect

Create a reusable harness for a domain: define the right agent topology, write role surfaces, add the skills they need, and leave a validation loop behind.

## When to use this skill

- Build a new domain-specific agent system from scratch
- Turn a project workflow into a reusable team + skill package
- Port Harness ideas from Claude Code to Codex, Gemini, OpenCode, Pi, or Claw style environments
- Re-architect an existing agent setup that has grown ad hoc
- Generate a small set of specialist agents and the skills they depend on

## Instructions

### Step 1: Read the source and local context

1. Read the local survey in `.survey/revfactory-harness-20260330/`.
2. Read bundled upstream references under `references/upstream/`.
3. Identify:
   - domain
   - target platforms
   - whether the user needs agent teams, subagents, or both
   - what outputs must become reusable files rather than chat-only advice

### Step 2: Choose the execution model

Use the smallest structure that still preserves clarity.

- `Pipeline`: sequential dependent work
- `Fan-out / Fan-in`: independent parallel work
- `Expert Pool`: selective specialists called as needed
- `Producer / Reviewer`: generation followed by quality gate
- `Supervisor`: one coordinator dynamically assigns tasks
- `Hierarchical Delegation`: nested orchestration only when task trees are truly deep

Use `references/upstream/agent-design-patterns.md` for pattern cues.

### Step 3: Map Harness concepts to the target platform

Do not assume every platform has Claude-style `.claude/agents/` and `.claude/skills/`.

- Claude Code:
  - agent roles → `.claude/agents/`
  - skills → `.claude/skills/`
- Codex CLI:
  - role prompts / agents → `.codex/agents/` or repo prompt surfaces
  - skills → `.codex/skills/`
- Gemini / Antigravity:
  - role surfaces and workflow docs should map to the platform's team or workflow layer
- OpenCode / Pi / Claw:
  - use equivalent prompt + skill directories or document the closest available pattern

When a platform lacks a direct equivalent, translate the intent rather than copying paths blindly.

### Step 4: Scaffold the artifact layout

Use the bootstrap script when you want a deterministic starting point:

```bash
bash .agent-skills/harness/scripts/bootstrap-harness.sh \
  --root . \
  --platform codex \
  --team-name review-team \
  --mode hybrid
```

This creates a neutral `.harness/` scaffold and a starter manifest before platform-specific mapping.

Use `references/architecture-patterns.md` and `references/platform-adapters.md` when you need a shorter local guide before diving into upstream references.

### Step 5: Define the harness outputs

Produce, at minimum:

1. agent roster
2. orchestration pattern
3. skill list
4. validation loop

For each agent, specify:

- role
- scope boundary
- inputs
- outputs
- handoff rules

For each skill, specify:

- trigger
- what it does
- references it depends on
- scripts or templates that make repeated work deterministic

### Step 6: Keep the harness lean

- Prefer 3-5 agents over large rosters by default
- Prefer a few high-leverage skills over broad catalogs
- Bundle repeated shell or file operations into `scripts/`
- Move long background material into `references/`
- Keep the main skill body short enough to read on activation

### Step 7: Validate before calling it done

Check all of the following:

- trigger phrases are explicit and not vague
- skill names and file paths are consistent
- the harness can explain who owns planning, execution, review, and recovery
- the orchestration pattern matches the actual dependency graph
- the target platform mapping is explicit where filesystem conventions differ

Use `references/validation-playbook.md` for the short validation checklist first, then use `references/upstream/skill-testing-guide.md` and `references/upstream/skill-writing-guide.md` to tighten the result.

### Step 8: Refresh upstream references when needed

If the upstream repo changed, refresh bundled references:

```bash
bash .agent-skills/harness/scripts/sync-upstream-harness.sh
```

Use `--check` for a dry run:

```bash
bash .agent-skills/harness/scripts/sync-upstream-harness.sh --check
```

## Examples

### Example 1: Cross-platform harness design

Input:

```text
Build a harness for a browser-testing team that should work on Claude, Codex, and Gemini.
```

Output:

- 3-4 agent roster
- producer/reviewer or fan-out/fan-in pattern
- platform-specific skill/agent path mapping
- validation checklist

### Example 2: Project-specific harness retrofit

Input:

```text
This repo has ad hoc prompts and scripts. Turn it into a reusable harness.
```

Output:

- current workflow decomposition
- replacement harness structure
- suggested skills and scripts
- migration order

## Best practices

1. Treat Harness as a meta-skill for building reusable agent systems, not as a generic code generator.
2. Separate the role layer from the skill layer.
3. Prefer deterministic scripts for repeated setup or sync work.
4. Translate upstream Claude-specific ideas into platform-neutral concepts before adapting them.
5. Reuse upstream reference files instead of re-explaining everything in the main skill.

## References

- `references/architecture-patterns.md`
- `references/platform-adapters.md`
- `references/validation-playbook.md`
- `references/platform-adaptation.md`
- `references/upstream/README.md`
- `references/upstream/agent-design-patterns.md`
- `references/upstream/orchestrator-template.md`
- `references/upstream/team-examples.md`
- `references/upstream/skill-writing-guide.md`
- `references/upstream/skill-testing-guide.md`
- `references/upstream/qa-agent-guide.md`
