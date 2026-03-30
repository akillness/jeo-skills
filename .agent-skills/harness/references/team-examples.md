# Team Examples

Real-world harness configurations for common domains.

---

## Example 1: Deep Research Team (Fan-out/Fan-in)

**Domain**: Technology or market research
**Pattern**: Fan-out/Fan-in
**Mode**: Agent Team

**Agent definitions:**

```
.claude/agents/official-researcher.md      — documentation, official sources, whitepapers
.claude/agents/media-researcher.md         — investment trends, news, analyst coverage
.claude/agents/community-researcher.md     — forums, social media, practitioner sentiment
.claude/agents/background-researcher.md    — competitive landscape, historical context
.claude/agents/research-orchestrator.md    — synthesizes all four lanes into report
```

**Workflow:**
1. Orchestrator assigns one topic to each researcher
2. Four researchers run in parallel
3. Researchers may SendMessage to share cross-domain discoveries
4. After all complete, orchestrator synthesizes findings
5. Final output: `_workspace/{run-id}/research-report.md`

---

## Example 2: Website Development Team (Pipeline)

**Domain**: Full-stack web development
**Pattern**: Pipeline with parallel phases
**Mode**: Agent Team

```
.claude/agents/ux-designer.md              — wireframes, component spec, accessibility
.claude/agents/frontend-engineer.md        — React/Next.js implementation
.claude/agents/backend-engineer.md         — API design and implementation
.claude/agents/qa-engineer.md              — testing, validation, cross-checking
.claude/agents/dev-orchestrator.md         — coordinates phases and integrates
```

**Workflow:**
```
Phase 1: ux-designer produces spec
Phase 2: frontend + backend run in parallel (both consume Phase 1 spec)
Phase 3: qa-engineer validates both outputs
Phase 4: dev-orchestrator integrates and delivers
```

---

## Example 3: Code Review Team (Expert Pool)

**Domain**: Code quality assurance
**Pattern**: Expert Pool
**Mode**: Agent Team (direct peer communication)

```
.claude/agents/security-reviewer.md        — OWASP Top 10, injection, secrets, auth
.claude/agents/performance-reviewer.md     — complexity, memory leaks, latency, caching
.claude/agents/testing-reviewer.md         — coverage, assertions, mocks, edge cases
.claude/agents/review-orchestrator.md      — routes issues, consolidates report
```

**Key feature**: Reviewers communicate directly with each other (no orchestrator mediation) for cross-domain issues:
```
security-reviewer sends: "Found unvalidated input at line 42 — may affect performance caching too"
performance-reviewer responds: "Confirmed — affects query cache invalidation logic"
```

---

## Example 4: Content Production Team (Producer-Reviewer)

**Domain**: Webtoon / comic production
**Pattern**: Pipeline + Producer-Reviewer
**Mode**: Sub-agent (simpler for sequential work)

```
.claude/agents/story-writer.md             — plot, dialogue, narrative arc
.claude/agents/visual-director.md          — panel layout, scene descriptions
.claude/agents/continuity-reviewer.md      — consistency check (characters, plot, style)
```

**Workflow:**
```
story-writer → visual-director → continuity-reviewer
                                      ↓ (PASS or FIX)
                              story-writer (revision)
                                      ↓ (max 2 loops)
                              Final output
```

**Reviewer evaluation framework:**
- `PASS` — meets all quality criteria, proceed
- `FIX` — specific issues listed, one revision needed
- `REDO` — fundamental problems, restart from previous phase

---

## Example 5: Supervisor Pattern — Code Migration (Supervisor)

**Domain**: Large-scale refactoring or migration
**Pattern**: Supervisor
**Mode**: Agent Team

```
.claude/agents/migration-supervisor.md     — analyzes files, estimates complexity, assigns batches
.claude/agents/migrator-a.md               — claims and processes assigned file batches
.claude/agents/migrator-b.md               — claims and processes assigned file batches
```

**Workflow:**
```
Supervisor:
  1. Scans all files to migrate
  2. Estimates complexity per file
  3. Assigns batch to Migrator A (low-complexity files)
  4. Assigns batch to Migrator B (high-complexity files)
  5. Monitors progress via TaskGet
  6. Reallocates stalled tasks to available migrators

Migrators:
  1. TaskUpdate → in_progress
  2. Process file
  3. Write output to _workspace/migrations/{filename}
  4. TaskUpdate → completed
  5. Report to Supervisor via SendMessage
```

---

## Agent Definition Template

Full example for the `worldbuilder` agent:

```markdown
---
name: worldbuilder
description: >
  Build the world context for a creative project — setting, rules, history, geography.
  Activate when a creative project needs coherent world-building before writing begins.
model: opus
allowed-tools: Read Write Bash
---

# Worldbuilder

## Core Responsibilities
- Define setting: time period, geography, social structure, technology level
- Establish world rules: physics, magic systems, political systems
- Document history: key events that shaped the current state
- Ensure internal consistency across all world elements

## Operational Principles
1. Ground every element in cause-and-effect logic — no arbitrary rules
2. Create constraints that generate interesting narrative tension
3. Leave deliberate gaps for other agents (character-designer, plot-architect) to fill

## Input Protocol
- Receives: project brief, genre, tone, target audience from orchestrator
- Format: plain text or structured brief in `_workspace/{run-id}/brief.md`

## Output Protocol
- Produces: `_workspace/{run-id}/worldbuilder/world-bible.md`
- Format: structured markdown with sections for Setting, Rules, History, Geography

## Error Handling
- On ambiguity: make explicit assumption and document it in world-bible
- On conflict with other agents: flag in `_workspace/{run-id}/conflicts.md`

## Team Communication
- Reports to: creative-orchestrator
- Communicates with: character-designer (character constraints), plot-architect (world events)
- Completion signal: SendMessage to orchestrator with path to world-bible.md
```
