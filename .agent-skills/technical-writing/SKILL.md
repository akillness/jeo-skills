---
name: technical-writing
description: >
  Write internal technical documentation for engineers and operators: specs,
  architecture docs, ADRs, runbooks, migration notes, rollout plans, and
  developer-facing implementation guides. Use when the main job is capturing
  technical decisions, system behavior, operating procedures, or change plans for
  builders and maintainers. Triggers on: tech spec, design doc, architecture doc,
  ADR, runbook, migration guide, implementation guide, rollout doc, operational
  guide, and technical writing. Route published API portals to `api-documentation`,
  end-user tutorials/FAQs to `user-guide-writing`, and release-note hygiene to
  `changelog-maintenance`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for repositories and docs-as-code workflows where the output lives in
  Markdown, ADR directories, architecture docs, runbooks, or internal docs sites.
license: MIT
metadata:
  tags: technical-writing, documentation, specs, architecture, adr, runbooks, migration, developer-docs, docs-as-code
  platforms: Claude, ChatGPT, Gemini
  version: "2.0.0"
  modernization: 2026-04-13
---

# Technical Writing

Use this skill when the main job is **writing or restructuring internal technical documentation for builders and operators**.

`technical-writing` is the documentation-cluster anchor for:
- technical specs
- architecture docs
- ADRs / decision records
- runbooks and incident procedures
- rollout / rollback / migration docs
- internal developer guides tied to implementation or operations

Read these support docs before choosing the mode or boundary:
- [references/document-modes-and-boundaries.md](references/document-modes-and-boundaries.md)
- [references/quality-checklists.md](references/quality-checklists.md)
- [references/docs-as-code-and-maintenance.md](references/docs-as-code-and-maintenance.md)

## When to use this skill
- A team needs a technical spec before implementation starts
- An engineer needs an architecture document or ADR that records trade-offs and decisions
- Operations needs a runbook, rollback guide, or incident response procedure
- A migration, rollout, or deprecation plan needs a durable written path
- A developer-facing implementation guide or internal onboarding doc needs to explain how a system works and how to work on it safely

## When not to use this skill
- **The main job is a published API portal, OpenAPI reference, SDK docs, or developer portal content** → use `api-documentation`
- **The main job is onboarding end users, tutorials, FAQs, screenshots, or help-center flows** → use `user-guide-writing`
- **The main job is release-note hygiene or semantic version / changelog upkeep** → use `changelog-maintenance`
- **The main job is product positioning, marketing copy, or GTM messaging** → use `marketing-automation` or another marketing skill
- **The main job is writing a plan for the work itself rather than the technical document artifact** → use `task-planning`, `api-design`, or the relevant planning skill first

## Instructions

### Step 1: Classify the document mode
Normalize the request into one primary mode before drafting.

```yaml
technical_writing_mode:
  primary_mode: spec | architecture | adr | runbook | migration | internal-guide
  audience: engineers | operators | mixed | unknown
  source_of_truth: repo | incident-notes | existing-doc | mixed | unknown
  lifecycle_state: draft | review | rewrite | maintenance
  docs_surface: markdown-repo | docs-site | wiki | unknown
  review_need: decision-signoff | operational-accuracy | handoff-clarity | unknown
```

Choose one primary mode per run:
- `spec` → planned change, scope, goals, non-goals, design, rollout
- `architecture` → system structure, components, interfaces, trade-offs
- `adr` → one material decision with options and rationale
- `runbook` → diagnose / operate / recover / escalate
- `migration` → move from old to new safely with rollback / compatibility notes
- `internal-guide` → developer-facing implementation or maintenance guidance

### Step 2: Confirm the real audience and neighboring skills
Before writing, answer three questions:
1. Who will act on this document?
2. What decision or action should it enable?
3. Which neighboring documentation skills should stay out of scope?

Quick route-out table:
| If the request sounds like... | Use |
|---|---|
| "Publish docs for our API / SDK" | `api-documentation` |
| "Write a tutorial / onboarding guide / FAQ" | `user-guide-writing` |
| "Summarize release changes / maintain CHANGELOG.md" | `changelog-maintenance` |
| "Decide the API contract itself before writing docs" | `api-design` |

### Step 3: Gather the minimum technical evidence
Do not draft from vibes alone. Pull the smallest credible evidence set first:
- current behavior or architecture notes
- interfaces / contracts / schemas / commands
- rollout or operational constraints
- known failure modes and recovery steps
- open questions or unresolved trade-offs

If evidence is missing, label assumptions explicitly instead of pretending the document is authoritative.

### Step 4: Draft using the smallest mode-specific structure
Use only the sections that fit the chosen mode.

#### A. Technical spec
Use for planned work before implementation.

Recommended skeleton:
```markdown
# <Feature / Change> Technical Specification

## Overview
## Problem
## Goals
## Non-goals
## Constraints
## Proposed design
## Interfaces / data / dependencies
## Risks and mitigations
## Rollout and rollback
## Open questions
```

#### B. Architecture document
Use for system structure and longer-lived technical explanation.

Recommended skeleton:
```markdown
# <System> Architecture

## Context
## Responsibilities and boundaries
## Components
## Data / request flow
## Key decisions
## Failure modes
## Security and performance notes
## Operational considerations
## Future changes / known limits
```

#### C. ADR
Use when one decision needs a durable record.

Recommended skeleton:
```markdown
# ADR: <Decision title>

- Status:
- Date:
- Owners:

## Context
## Decision
## Alternatives considered
## Consequences
## Follow-up actions
```

#### D. Runbook
Use when someone will operate, diagnose, or recover a system.

Recommended skeleton:
```markdown
# <Service> Runbook

## Purpose
## Preconditions / access
## Signals and symptoms
## Immediate checks
## Standard operating procedure
## Escalation path
## Rollback / recovery
## References
```

#### E. Migration / rollout guide
Use when systems or users move from old to new.

Recommended skeleton:
```markdown
# <Migration> Guide

## Scope
## Preconditions
## Compatibility / breaking changes
## Step-by-step migration
## Validation
## Rollback
## Communication notes
```

#### F. Internal developer guide
Use for implementation-facing reference that is not end-user help.

Recommended skeleton:
```markdown
# <Topic> Developer Guide

## What this system does
## When to use / not use it
## Key concepts
## Local development or operational workflow
## Common pitfalls
## Troubleshooting / escalation
## Related docs
```

### Step 5: Apply document-type rules instead of one generic style
Use these rules aggressively:
- **Specs** should separate goals from non-goals.
- **Architecture docs** should explain boundaries and trade-offs, not every code path.
- **ADRs** should capture a decision, not become a full design doc.
- **Runbooks** should optimize for fast action under pressure.
- **Migration guides** should foreground compatibility, order of operations, and rollback.
- **Internal guides** should explain operational or implementation reality, not market value props.

### Step 6: Make the document docs-as-code friendly
Default to repo-friendly, reviewable writing:
- stable headings
- concise bullet lists where operators scan
- explicit commands, paths, owners, and prerequisites
- dated decisions and status for ADR-like docs
- links to source-of-truth docs instead of duplicated narrative when possible

If the doc belongs in a docs site or wiki later, write the technical core first and let the publishing surface adapt it.

### Step 7: Run the review checklist
Before finalizing, verify:
1. The audience is named or obvious.
2. The document tells the reader what decision or action it enables.
3. Assumptions and unknowns are labeled.
4. Commands / interfaces / rollback steps are concrete where relevant.
5. Neighboring documentation skills are not being absorbed.
6. The title and section layout match the chosen mode.

### Step 8: Return one of these output shapes
Preferred output:

```markdown
# Technical Writing Brief

## Mode
- Primary mode:
- Why it fits:
- Audience:

## Source material used
- Repo/docs/evidence:
- Assumptions / gaps:

## Draft structure
1. section
2. section
3. section

## Writing notes
- Key decisions / actions enabled:
- Risks / unknowns:

## Route-outs
- Neighboring skills before/after this work:
```

Or, if the user asked for the finished artifact, produce the chosen document mode directly with the mode-specific structure above.

## Examples

### Example 1: Internal design doc before implementation
**Input**
> Write a technical spec for moving our worker queue from Redis lists to Redis streams. Engineers need goals, constraints, rollout, and rollback before coding.

**Good output direction**
- mode: `spec`
- audience: engineers
- include goals, non-goals, constraints, design, rollout, rollback, open questions
- keep API portal publishing out of scope

### Example 2: Architecture decision capture
**Input**
> We chose Postgres logical replication over dual writes. Record the decision and alternatives in an ADR.

**Good output direction**
- mode: `adr`
- capture context, decision, alternatives, consequences, follow-up
- keep the document short and decision-focused

### Example 3: Incident runbook
**Input**
> Write a runbook for when the payments worker backlog spikes and retries start timing out.

**Good output direction**
- mode: `runbook`
- include symptoms, immediate checks, operating steps, escalation, rollback / recovery
- optimize for operator speed, not essay-style explanation

### Example 4: Boundary with user docs
**Input**
> Create a beginner tutorial with screenshots that teaches customers how to export their data.

**Good output direction**
- route to `user-guide-writing`
- explain that this request is end-user onboarding / help content, not internal technical documentation

## Best practices
1. Choose the document mode before writing the body.
2. Keep internal technical docs decision- and action-oriented.
3. Write only the sections the mode needs; do not force every template into every document.
4. Separate internal design / ops docs from API portals, user help, and release notes.
5. Prefer docs-as-code structure: reviewable Markdown, stable headings, and source-linked facts.
6. Label assumptions and unresolved questions explicitly.
7. For runbooks and migrations, make rollback and escalation easy to find.

## References
- [Diátaxis](https://diataxis.fr/)
- [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)
- [Write the Docs — How to write software documentation](https://www.writethedocs.org/guide/writing/beginners-guide-to-docs/)
- [Architectural Decision Records](https://adr.github.io/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
