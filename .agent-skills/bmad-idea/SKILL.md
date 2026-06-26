---
name: bmad-idea
description: ">"
compatibility: ">"
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: bmad, ideation, concept-design, problem-framing, positioning, storytelling, product-discovery, game-concept, creative-routing
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: bmad-idea
  version: 2.0.0
  source: akillness/jeo-skills
---






# BMAD Idea Router

Use this skill as the repository's **pre-planning creative intake and concept-routing layer**.

The job is not to dump dozens of ideation techniques or persona gimmicks.
The job is to:
1. normalize a messy early-stage idea packet,
2. choose the single framing mode that reduces ambiguity fastest,
3. produce one concept artifact that downstream work can actually use,
4. route the next step to the right neighboring skill.

Read [references/operating-modes.md](references/operating-modes.md) for mode-selection heuristics, [references/handoff-boundaries.md](references/handoff-boundaries.md) for adjacent-skill routing, and [references/concept-packet-template.md](references/concept-packet-template.md) for reusable output scaffolding.

## When to use this skill
- The user has a rough idea and needs a clearer problem, audience, concept, or story before planning starts
- The request is still ambiguous enough that jumping straight to a PRD, sprint plan, or launch plan would be premature
- A product, service, content, or GTM idea needs one concept brief, positioning brief, or narrative packet first
- A game idea needs pillars, player fantasy, core loop, and first concept framing before `bmad-gds` or task decomposition
- The user explicitly mentions brainstorming, concept shaping, design thinking, positioning, JTBD-style framing, story packaging, or pre-planning clarification

## When not to use this skill
- The main need is phase-based delivery routing or deciding the next BMAD artifact after project framing already exists → use `bmad`
- The main need is backlog slicing, story decomposition, estimation, or sprint preparation → use `task-planning`
- The main need is broad marketing execution, launch planning, funnel work, or KPI-aware campaign routing → use `marketing-automation`
- The main need is game-production coordination for an existing GDD, playtest packet, build issue, or milestone → use `bmad-gds`
- The main need is only rewriting copy or polishing prose with no framing decision to make

## Operating modes
Choose exactly one primary mode per run.

1. **Problem framing**
   - Use when the idea is fuzzy and the main gap is *what problem actually matters*
   - Best for founders, PMs, designers, and consultants starting from raw opportunity language

2. **Audience and value framing**
   - Use when the offer exists but the target user, JTBD, pains, gains, or differentiation are weak
   - Best for product marketing, GTM, and concept-validation work

3. **Concept shaping**
   - Use when the direction is promising but still needs a tighter concept, constraints, options, and core promise
   - Best for product, feature, service, and offer-level idea shaping

4. **Game concept framing**
   - Use when the packet is about game fantasy, pillars, audience, core loop, progression, or tone before production planning
   - Best for solo developers and small game teams before `bmad-gds`

5. **Story packaging**
   - Use when the main need is a narrative, pitch, concept story, or internal alignment packet
   - Best when the problem is understanding and buy-in rather than raw ideation volume

## Instructions

### Step 1: Normalize the idea intake
Capture the packet in this format before choosing a mode:

```yaml
idea_packet:
  domain: product | gtm | content | consulting | game | mixed | unknown
  stage: raw-idea | rough-concept | candidate-offer | concept-with-notes | narrative-draft | unknown
  audience:
    primary_user: "who this is for"
    pains_or_needs:
      - pain 1
      - pain 2
  problem_or_goal: "what change or outcome is this idea trying to create?"
  current_material:
    - notes
    - brainstorm bullets
    - positioning draft
    - customer research
    - game concept notes
    - moodboard / references
    - pitch / story draft
  strongest_unknown: problem | audience | value | concept-scope | game-pillars | narrative | unknown
  downstream_target: bmad | task-planning | marketing-automation | bmad-gds | deck | unknown
  constraint: time | scope | evidence | differentiation | alignment | unknown
```

If the packet is incomplete, continue with explicit assumptions instead of stalling.

### Step 2: Choose one primary mode
Select the mode that reduces ambiguity fastest.

| If the biggest gap is... | Choose... | Primary output |
|---|---|---|
| We do not yet know what problem is worth solving | Problem framing | `problem brief` |
| We do not know for whom this idea matters or why it is better | Audience and value framing | `positioning brief` |
| We have too many half-ideas and need one tighter concept | Concept shaping | `concept brief` |
| We need to define fantasy, pillars, loop, and hook for a game | Game concept framing | `game concept packet` |
| The idea exists but people do not understand or support it yet | Story packaging | `story / pitch packet` |

Do not mix multiple modes unless the user explicitly asks for a two-pass workflow.

### Step 3: Produce one concept artifact
Return exactly one primary artifact:
- `problem brief`
- `positioning brief`
- `concept brief`
- `game concept packet`
- `story / pitch packet`

The artifact should be concise, reusable, and ready to hand to a downstream skill.

### Step 4: Make route-outs explicit
When the concept artifact is done, recommend the next downstream lane if appropriate:
- `bmad` → when the next job is phase routing and selecting PRD / tech spec / architecture / sprint-plan depth
- `task-planning` → when the concept is approved and needs backlog slices, milestones, or execution packets
- `marketing-automation` → when the concept is sound and now needs launch, messaging operations, campaign structure, or KPI-aware marketing follow-through
- `bmad-gds` → when the game concept is strong enough to turn into milestones, GDD slices, playtest planning, or production coordination

Always state **why** that route-out is next and **what packet** should be passed forward.

### Step 5: Use this output structure

```markdown
# Idea Routing Brief

## Scope
- Domain: ...
- Stage: ...
- Strongest unknown: ...
- Downstream target: ...
- Confidence: high | medium | low

## Chosen mode
- problem-framing | audience-and-value-framing | concept-shaping | game-concept-framing | story-packaging

## What matters most now
- 2-4 bullets grounded in the packet

## Recommended artifact
- problem brief | positioning brief | concept brief | game concept packet | story / pitch packet

## Artifact contents
| Section | Decision | Why it matters now |
|---------|----------|--------------------|
| ... | ... | ... |

## Immediate next steps
1. ...
2. ...
3. ...

## Route-outs
- Skill / workflow: ...
- Why next: ...
- What to pass forward: ...

## What not to do yet
- 1-3 bullets preventing premature planning, launch detail, or execution drift
```

### Step 6: Keep the artifact lean and decision-oriented
Good outputs are short enough to reuse.

Guardrails:
- prefer a few strong decisions over a giant brainstorm transcript
- convert ideas into constraints, assumptions, and next artifacts
- preserve uncertainty explicitly instead of pretending the concept is resolved
- stop before roadmap depth, sprint decomposition, or campaign execution unless the user asks for the handoff skill next

## Compatibility commands and legacy naming
Older BMAD-CIS usage may mention these commands or personas:
- `bmad-cis-brainstorming`
- `bmad-cis-design-thinking`
- `bmad-cis-innovation-strategy`
- `bmad-cis-problem-solving`
- `bmad-cis-storytelling`
- Carson / Maya / Victor / Dr. Quinn / Sophia

Treat them as **mode hints**, not separate first-class workflows. Map them into the modern modes above:
- brainstorming / design thinking / problem solving → usually `problem framing` or `concept shaping`
- innovation strategy → usually `audience and value framing` or `concept shaping`
- storytelling → usually `story packaging`

## Output format
Always return a **short operator-style idea routing brief**.

Required qualities:
- one chosen mode, not a kitchen sink of creativity tactics
- one reusable artifact, not a pile of disconnected ideas
- explicit route-outs to neighboring skills when the next lane is clear
- visible assumptions and unresolved questions
- keep the result under roughly 400-700 words unless the user asks for a larger concept packet

## Examples

### Example 1: product concept before planning
**Input**
> Use bmad-idea. We think there is an opportunity around AI-assisted team handoffs, but we do not know the sharp problem or who it is really for.

**Output sketch**
- Chosen mode: `problem framing`
- Recommended artifact: `problem brief`
- Route-out after approval: `bmad`

### Example 2: GTM / positioning ambiguity
**Input**
> We built a workflow tool, but our messaging is fuzzy and every pitch sounds generic.

**Output sketch**
- Chosen mode: `audience and value framing`
- Recommended artifact: `positioning brief`
- Route-out after approval: `marketing-automation`

### Example 3: game concept shaping
**Input**
> Help us shape a cozy automation game idea before we start a real GDD.

**Output sketch**
- Chosen mode: `game concept framing`
- Recommended artifact: `game concept packet`
- Route-out after approval: `bmad-gds`

## Best practices
1. **Act like a concept router, not a prompt zoo** — choose one framing mode that fits the ambiguity.
2. **Prefer one artifact that travels well** — the point is to make downstream planning easier.
3. **Use neighboring skills on purpose** — `bmad`, `task-planning`, `marketing-automation`, and `bmad-gds` each own later-stage work.
4. **Keep uncertainty visible** — a concept brief should surface assumptions, not bury them.
5. **Bridge domains without flattening them** — product, GTM, and game ideas share structure, but their outputs differ.
6. **Treat legacy commands as compatibility language** — the modern source of truth is the routing model.

## References
- [references/operating-modes.md](references/operating-modes.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)
- [references/concept-packet-template.md](references/concept-packet-template.md)
- `../bmad/SKILL.md`
- `../task-planning/SKILL.md`
- `../marketing-automation/SKILL.md`
- `../bmad-gds/SKILL.md`
