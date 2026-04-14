---
name: bmad
description: >
  Route BMAD/BMM phase-based development from idea to implementation by choosing
  project level, identifying the current phase, selecting the next artifact, and
  handing detailed work to the right downstream skill. Use when the user wants a
  structured BMAD workflow, asks what phase comes next, needs a PRD / tech spec /
  architecture / sprint-plan handoff, or wants a portable BMAD entrypoint across
  Claude, Codex, Gemini, or OpenCode. Triggers on: bmad, BMAD, BMM, workflow-init,
  workflow-status, what phase are we in, what should we write next, PRD to
  architecture, architecture to implementation, phased AI development.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Core phase-routing skill for Claude, Codex, Gemini, and OpenCode workflows.
  Runtime-specific orchestration belongs in `omc`, `omx`, or `ohmg`; approval
  gates belong in `plannotator`; detailed decomposition belongs in `task-planning`.
metadata:
  tags: bmad, workflow, orchestration, phased-development, planning, architecture, implementation
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: bmad
  version: "2.0.0"
  source: akillness/oh-my-skills
---

# BMAD Core Workflow Router

Use this skill as the **portable BMAD/BMM entrypoint** for the repository.

The job is not to teach every command, module, or runtime detail inline.
The job is to:
1. identify the project's level and current BMAD phase,
2. determine the next required or optional artifact,
3. keep review and approval gates visible,
4. route runtime-specific or specialist follow-up to the correct downstream skill.

Read [references/core-routing.md](references/core-routing.md) first for the canonical routing model, then use [references/status-and-review.md](references/status-and-review.md) and [references/runtime-and-module-boundaries.md](references/runtime-and-module-boundaries.md) when the request needs more depth.

## When to use this skill
- The user wants to start or resume a BMAD/BMM-style project workflow
- The user asks which phase comes next after analysis, planning, architecture, or implementation work
- The user needs help choosing between a product brief, PRD, tech spec, architecture doc, sprint plan, or story-level execution packet
- The user has partial BMAD state and needs the next artifact chosen from the current status
- The user wants a vendor-neutral BMAD entrypoint before dropping into Claude-, Codex-, or Gemini-specific runtime overlays

## When not to use this skill
- The main need is a runtime-specific orchestration setup for Claude Code → use `omc`
- The main need is a Codex-first multi-agent workflow or `$plan` / `$ralph` / `$team` behavior → use `omx`
- The main need is a Gemini / Antigravity portable harness centered on `.agents/` → use `ohmg`
- The main need is artifact approval, annotation, or plan review → use `plannotator`
- The main need is execution-ready backlog slicing after the phase decision is made → use `task-planning`
- The main need is a game-production packet (GDD, playtest notes, build issues, launch beats) → use `bmad-gds`
- The main need is open-ended ideation before project framing exists → use `bmad-idea`

## Instructions

### Step 1: Normalize the project intake
Before choosing a phase, reduce the request to a BMAD intake brief:

```yaml
bmad_intake:
  project_type: web-app | backend-api | mobile-app | game | library | automation | unknown
  project_level: 0 | 1 | 2 | 3 | 4 | unknown
  current_material:
    - idea-notes
    - product-brief
    - prd
    - tech-spec
    - architecture
    - sprint-plan
    - active-story
    - implementation-diff
    - review-feedback
  current_phase: analysis | planning | solutioning | implementation | unknown
  main_question: "what artifact or decision is needed next?"
  main_constraint: time | scope | ambiguity | risk | unknown
  runtime_context: claude | codex | gemini | opencode | mixed | unknown
```

If the user gives incomplete information, infer the best visible level and say which assumptions you made.

### Step 2: Choose the project level before the next artifact
Use this scale:
- **Level 0** — single atomic change, bug fix, config tweak
- **Level 1** — small feature, limited files, low coordination cost
- **Level 2** — medium feature set, cross-cutting behavior, clear planning + architecture need
- **Level 3** — complex integration, multiple subsystems, API/data contracts, multi-sprint delivery
- **Level 4** — major overhaul, platform migration, enterprise-scale coordination

Do not jump straight to architecture for level 0–1 work unless the packet clearly justifies it.

### Step 3: Identify the current phase and next artifact
Choose the **single next artifact** that best reduces ambiguity now:

| Current state | Preferred next artifact |
|---|---|
| vague idea, research, problem framing | `product-brief` |
| requirements unclear but build scope is emerging | `prd` or `tech-spec` |
| planning exists, system shape is still fuzzy | `architecture` |
| architecture exists, execution slicing is weak | `sprint-plan` or `story packet` |
| implementation is underway but status is unclear | `workflow-status` update + next-story recommendation |
| artifact exists but lacks approval | `review gate` via `plannotator` |

Guiding rules:
- **Level 0–1** work often goes `tech-spec -> implementation` with a lighter planning surface.
- **Level 2+** work usually needs `PRD -> architecture -> sprint plan`.
- If the artifact already exists but is not reviewed, prioritize the **review gate** before inventing another artifact.

### Step 4: Route specialist work explicitly
If the core BMAD decision is made, hand off clearly:
- `plannotator` → review / approval gate for PRD, architecture, sprint plan, or plan diffs
- `task-planning` → convert approved scope into execution-ready tasks, stories, or milestone packets
- `omc` → Claude-first runtime orchestration, hooks, team mode, stop callbacks
- `omx` → Codex-first orchestration, AGENTS.md injection, workflow skills, tmux team runtime
- `ohmg` → Gemini / Antigravity portable harness, `.agents/` source of truth, generated runtime views
- `bmad-gds` → game-specific production routing
- TEA / module references → testing, release gates, or specialist module depth

Leave a short reason for the route-out. Do not just name the neighboring skill.

### Step 5: Produce a compact BMAD routing brief
Always return this structure:

```markdown
# BMAD Routing Brief

## Scope
- Project type: ...
- Project level: 0 | 1 | 2 | 3 | 4
- Runtime context: ...
- Confidence: high | medium | low

## Current phase
- analysis | planning | solutioning | implementation | unknown
- Why: ...

## Recommended next artifact
- product-brief | prd | tech-spec | architecture | sprint-plan | story packet | review gate | workflow-status update

## Why this is next
- 2-4 bullets grounded in the packet

## Immediate next steps
1. ...
2. ...
3. ...

## Route-outs
- Skill / module: ...
- Why: ...
- What to pass forward: ...

## What not to do yet
- 1-3 bullets preventing premature detail or the wrong lane
```

### Step 6: Keep state and review visible
When a project already uses BMAD state files or helper scripts, keep them in the loop:
- update or inspect workflow/status artifacts before recommending a new phase leap
- if a required artifact exists but has not been reviewed, route to `plannotator`
- prefer script/status awareness over re-deriving the workflow from scratch every turn

### Step 7: Push deep detail into references
Do **not** inflate the main response with every TEA, Fabric, SSD, or install command. Use the references when needed:
- [core routing model](references/core-routing.md)
- [status files, scripts, and review gates](references/status-and-review.md)
- [runtime and module boundaries](references/runtime-and-module-boundaries.md)

## Output format
Return a **short BMAD routing brief**.

Required qualities:
- choose one next artifact, not five parallel documents
- make the project-level assumption explicit
- keep runtime/setup detail separated from core phase logic
- preserve review-gate visibility before phase advancement
- keep the result under roughly 400-700 words unless the user asks for a full workflow packet

## Examples

### Example 1: vague feature request
**Input**
> Use bmad. We need to add team billing and audit logs to our SaaS app, but the shape is still fuzzy.

**Output sketch**
- Project level: `2`
- Current phase: `planning`
- Recommended next artifact: `prd`
- Route-out after approval: `architecture`, then `task-planning`

### Example 2: architecture exists, execution weak
**Input**
> We already wrote the architecture doc for our API migration. What should we do next in BMAD?

**Output sketch**
- Current phase: `solutioning`
- Recommended next artifact: `review gate` if architecture is unreviewed, otherwise `sprint-plan`
- Route-out: `plannotator` first, `task-planning` second

### Example 3: Codex-first user
**Input**
> I want BMAD for Codex CLI. What should I actually use?

**Output sketch**
- Keep `bmad` as the phase router
- Route runtime specifics to `omx`
- Recommend the next BMAD artifact based on project level instead of dumping Codex runtime docs inline

## Best practices
1. **Act like a phase router, not a monolith** — choose the next artifact and route detail outward.
2. **Choose level before artifact depth** — level 0–1 and level 2–4 should not produce the same paperwork.
3. **Guard phase advancement** — if an artifact exists but has not been reviewed, keep the gate visible.
4. **Keep runtime overlays separate** — `omc`, `omx`, and `ohmg` own vendor/runtime specifics.
5. **Prefer one clear handoff** — the best answer is usually one next artifact plus one or two route-outs, not a giant workflow dump.
6. **Use references for deep detail** — TEA, Fabric, SSD, scripts, and module depth belong in support docs.

## References
- [Core routing model](references/core-routing.md)
- [Status files, scripts, and review gates](references/status-and-review.md)
- [Runtime and module boundaries](references/runtime-and-module-boundaries.md)
- `./scripts/init-project.sh`
- `./scripts/check-status.sh`
- `./scripts/phase-gate-review.sh`
- [Upstream BMAD README](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/README.md)
- `../plannotator/SKILL.md`
- `../task-planning/SKILL.md`
- `../omc/SKILL.md`
- `../omx/SKILL.md`
- `../ohmg/SKILL.md`
- `../bmad-gds/SKILL.md`
