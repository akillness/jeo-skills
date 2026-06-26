---
name: bmad
description: ">"
compatibility: ">"
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: bmad, workflow, orchestration, phased-development, planning, architecture, implementation
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: bmad
  version: 2.1.0
  source: akillness/jeo-skills
---






# BMAD Packet-First Router

Use `bmad` as the **common-layer BMAD/BMM front door**.

The job is not to dump every phase command or runtime setup rule.
The job is to:
1. identify the **packet** the user already has,
2. choose the project level and likely current phase,
3. recommend the **single next artifact or gate** that reduces ambiguity now,
4. route runtime-, review-, execution-, or game-specific detail outward.

Read [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) first for the fastest routing model. Use [references/core-routing.md](references/core-routing.md), [references/status-and-review.md](references/status-and-review.md), and [references/runtime-and-module-boundaries.md](references/runtime-and-module-boundaries.md) when you need more depth.

## When to use this skill
- The user wants to start or resume a BMAD/BMM-style workflow from mixed project state
- The user asks what phase comes next after idea notes, a PRD, a tech spec, architecture work, or partial implementation
- The user has an existing repo, issue, review note, or brownfield status and needs the next artifact chosen truthfully
- The user wants a vendor-neutral BMAD front door before dropping into Claude-, Codex-, or Gemini-specific runtime overlays
- The user needs help deciding whether the next move is ideation, planning, architecture, approval, execution slicing, or runtime handoff

## When not to use this skill
- The main need is open-ended concept shaping before project framing exists → use `bmad-idea`
- The main need is a game-production packet (GDD, playtest notes, build issues, launch beats) → use `bmad-gds`
- The main need is artifact approval, annotation, or plan review → use `plannotator`
- The main need is execution-ready backlog slicing after the next artifact is already known → use `task-planning`
- The main need is runtime-specific orchestration setup for Claude Code → use `omc`
- The main need is Codex-first workflow runtime behavior → use `omx`
- The main need is Gemini / Antigravity portable harness setup → use `ohmg`

## Instructions

### Step 1: Normalize the intake as one primary packet
Before talking about phases, choose the **single best packet** that describes the current ask:

```yaml
bmad_packet:
  packet_type:
    - concept-packet
    - planning-packet
    - architecture-packet
    - review-gate-packet
    - execution-packet
    - runtime-handoff-packet
    - brownfield-resume-packet
  evidence_in_hand:
    - idea-notes
    - product-brief
    - prd
    - tech-spec
    - architecture-draft
    - review-feedback
    - active-repo
    - issue-or-bug-link
    - sprint-plan
    - milestone-or-launch-pressure
  project_type: web-app | backend-api | mobile-app | game | library | automation | unknown
  project_level: 0 | 1 | 2 | 3 | 4 | unknown
  runtime_context: claude | codex | gemini | opencode | mixed | unknown
  main_constraint: ambiguity | review-blocker | execution-readiness | runtime-setup | brownfield-drift | unknown
```

Rules:
- Pick **one primary packet first**, even if the user mentions several artifacts.
- If the packet is obviously pre-planning, say so and route to `bmad-idea` early.
- If the packet is mostly game-production coordination, route to `bmad-gds` early.
- If the request starts from an existing repo, issue, or partial implementation, prefer `brownfield-resume-packet` over pretending the project is greenfield.

### Step 2: Choose project level before artifact depth
Use this scale:
- **Level 0** — single atomic change, bug fix, config tweak
- **Level 1** — small feature, limited files, low coordination cost
- **Level 2** — medium feature set, cross-cutting behavior, clear planning + architecture need
- **Level 3** — complex integration, multiple subsystems, API/data contracts, multi-sprint delivery
- **Level 4** — major overhaul, platform migration, enterprise-scale coordination

Do not force architecture or heavyweight planning onto level 0–1 work unless the visible packet truly requires it.

### Step 3: Infer the likely current phase from the packet
Use the packet to infer the current BMAD phase, not the other way around:

| Packet type | Likely phase | Default next artifact or gate |
|---|---|---|
| `concept-packet` | analysis | `product-brief` or route to `bmad-idea` |
| `planning-packet` | planning | `prd` or `tech-spec` |
| `architecture-packet` | solutioning | `architecture` or `architecture review gate` |
| `review-gate-packet` | boundary between phases | `plannotator` review before advancing |
| `execution-packet` | implementation | `sprint-plan`, `story packet`, or route to `task-planning` |
| `runtime-handoff-packet` | implementation-ready | runtime route-out to `omc`, `omx`, or `ohmg` |
| `brownfield-resume-packet` | mixed / unknown | `workflow-status` update, repo-state summary, then the smallest truthful next artifact |

Guiding rules:
- Prefer the **smallest truthful next artifact**.
- If an artifact already exists but has not been reviewed, the next move is often the **review gate**, not another new document.
- If the request is really a runtime/setup ask, keep `bmad` short and route outward.

### Step 4: Choose one next artifact, not a parallel stack
Pick the **single next artifact or gate** that best reduces ambiguity now:

| Current state | Preferred next move |
|---|---|
| vague idea, opportunity, user problem | `product-brief` |
| requirements emerging, implementation shape still unclear | `prd` or `tech-spec` |
| planning exists, system shape is still fuzzy | `architecture` |
| architecture exists but approval is missing | `review gate` |
| approved architecture exists, execution slicing is weak | `sprint-plan` or `story packet` |
| active implementation exists but status is unclear | `workflow-status` update + next-story recommendation |
| runtime is the real blocker after approval | runtime handoff to `omc` / `omx` / `ohmg` |

### Step 5: Route specialist work explicitly
If the front-door decision is made, route the rest clearly:
- `bmad-idea` → pre-planning concept framing before formal BMAD artifacts exist
- `plannotator` → review / approval gate for PRD, architecture, sprint plan, or plan diffs
- `task-planning` → execution-ready slicing after the next artifact is approved or obvious
- `omc` → Claude-first runtime orchestration, hooks, team mode, stop callbacks
- `omx` → Codex-first orchestration, AGENTS.md injection, workflow skills, tmux team runtime
- `ohmg` → Gemini / Antigravity portable harness, `.agents/` source of truth, generated runtime views
- `bmad-gds` → game-specific production routing

Leave a short reason for the route-out. Do not just name the neighboring skill.

### Step 6: Keep state and review visible
When a project already uses BMAD state files or helper scripts, keep them in the loop:
- inspect status/config artifacts before recommending a phase leap
- if a required artifact exists but lacks approval, route to `plannotator`
- prefer script/status awareness over re-deriving the workflow from scratch
- use brownfield evidence honestly instead of pretending the project is still at idea stage

### Step 7: Produce a compact BMAD routing brief
Always return this structure:

```markdown
# BMAD Routing Brief

## Scope
- Packet type: ...
- Project type: ...
- Project level: 0 | 1 | 2 | 3 | 4
- Runtime context: ...
- Confidence: high | medium | low

## Current phase
- analysis | planning | solutioning | implementation | mixed | unknown
- Why: ...

## Recommended next move
- product-brief | prd | tech-spec | architecture | review gate | sprint-plan | story packet | workflow-status update | runtime handoff

## Why this is next
- 2-4 bullets grounded in the packet

## Route-outs
- Skill / module: ...
- Why: ...
- What to pass forward: ...

## What not to do yet
- 1-3 bullets preventing premature detail or the wrong lane
```

### Step 8: Push detail into references
Do **not** inflate the main response with every helper script, command family, or runtime rule. Use the references when needed:
- [intake packets and route-outs](references/intake-packets-and-route-outs.md)
- [core routing model](references/core-routing.md)
- [status files, scripts, and review gates](references/status-and-review.md)
- [runtime and module boundaries](references/runtime-and-module-boundaries.md)

## Output format
Return a **short BMAD routing brief**.

Required qualities:
- choose one primary packet before choosing the next artifact
- make the project-level assumption explicit
- keep review-gate visibility before phase advancement
- keep runtime/setup detail separated from the common BMAD layer
- keep the result under roughly 400-700 words unless the user asks for a full workflow packet

## Examples

### Example 1: brownfield repo, unclear next step
**Input**
> Use bmad. We already have a repo and some product notes, but planning drifted and I don't know whether we need a PRD, architecture, or just sprint planning.

**Output sketch**
- Packet type: `brownfield-resume-packet`
- Likely phase: `mixed`
- Recommended next move: `workflow-status` update, then whichever artifact is actually missing
- Route-outs only after the missing artifact is identified

### Example 2: architecture exists, execution weak
**Input**
> We already wrote the architecture doc for our API migration. What should we do next in BMAD?

**Output sketch**
- Packet type: `architecture-packet`
- Current phase: `solutioning`
- Recommended next move: `review gate` if architecture is unreviewed, otherwise `sprint-plan`
- Route-out: `plannotator` first, `task-planning` second

### Example 3: runtime-specific follow-up
**Input**
> I want BMAD for Codex CLI. What should I actually use?

**Output sketch**
- Keep `bmad` as the packet/phase router
- Packet type: `runtime-handoff-packet`
- Route Codex runtime specifics to `omx`
- Do not turn `bmad` into a Codex setup guide

## Best practices
1. **Act like a packet-first router** — start from the artifact or evidence the user already has.
2. **Choose level before depth** — level 0–1 and level 2–4 should not produce the same paperwork.
3. **Keep review visible** — if approval is the blocker, say so before inventing a new artifact.
4. **Keep runtime overlays separate** — `omc`, `omx`, and `ohmg` own vendor/runtime specifics.
5. **Prefer one clear handoff** — one next move plus one or two route-outs beats a giant workflow dump.
6. **Use references for deep detail** — helper scripts, status rules, and runtime boundaries belong in support docs.

## References
- [Intake packets and route-outs](references/intake-packets-and-route-outs.md)
- [Core routing model](references/core-routing.md)
- [Status files, scripts, and review gates](references/status-and-review.md)
- [Runtime and module boundaries](references/runtime-and-module-boundaries.md)
- `./scripts/init-project.sh`
- `./scripts/check-status.sh`
- `./scripts/phase-gate-review.sh`
- [Upstream BMAD README](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/README.md)
- `../bmad-idea/SKILL.md`
- `../plannotator/SKILL.md`
- `../task-planning/SKILL.md`
- `../omc/SKILL.md`
- `../omx/SKILL.md`
- `../ohmg/SKILL.md`
- `../bmad-gds/SKILL.md`
