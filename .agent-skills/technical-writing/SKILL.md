---
name: technical-writing
description: >
  Write internal technical documentation for engineers and operators: technical
  specs, architecture docs, ADRs, runbooks, migration plans, and
  developer-facing implementation guides. Use when the main job is capturing a
  technical decision, system boundary, operating procedure, or rollout path for
  builders and maintainers. Triggers on: tech spec, design doc, architecture
  doc, ADR, runbook, migration guide, implementation guide, rollout doc,
  operational guide, and internal technical writing. Route API portals to
  `api-documentation`, end-user help/tutorials to `user-guide-writing`, release
  notes to `changelog-maintenance`, decks to `presentation-builder`, and GTM
  messaging to `marketing-automation`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for repositories and docs-as-code workflows where the output lives in
  Markdown, ADR directories, architecture docs, runbooks, migration docs, or
  internal knowledge bases.
license: MIT
metadata:
  tags: technical-writing, documentation, specs, architecture, adr, runbooks, migration, developer-docs, docs-as-code
  platforms: Claude, ChatGPT, Gemini
  version: "2.1.0"
  modernization: 2026-04-13
  hardening: 2026-04-17
---

# Technical Writing

Use this skill when the deliverable is **internal technical documentation for builders and operators**.

`technical-writing` is the documentation-cluster anchor for:
- technical specs
- architecture docs
- ADRs / decision records
- runbooks and incident procedures
- rollout / rollback / migration guides
- developer-facing implementation or maintenance guides

Read these support docs before choosing the mode or boundary:
- [references/document-modes-and-boundaries.md](references/document-modes-and-boundaries.md)
- [references/mode-structures.md](references/mode-structures.md)
- [references/quality-checklists.md](references/quality-checklists.md)
- [references/docs-as-code-and-maintenance.md](references/docs-as-code-and-maintenance.md)

## When to use this skill
- A team needs a technical spec before implementation starts
- An engineer needs an architecture document or ADR that records trade-offs and decisions
- Ops needs a runbook, rollback guide, or incident response procedure
- A migration or rollout needs a durable written path with validation and rollback notes
- A developer-facing internal guide needs to explain how a system works and how to work on it safely

## When not to use this skill
- **Published API docs, SDK docs, OpenAPI reference, developer portal content** → `api-documentation`
- **End-user onboarding, screenshots, tutorials, FAQs, help-center flows** → `user-guide-writing`
- **Release notes, `CHANGELOG.md`, migration announcements for customers/devs** → `changelog-maintenance`
- **Slides, pitch decks, roadmap presentations, architecture demos** → `presentation-builder`
- **Product positioning, launch copy, GTM messaging, marketing automation** → `marketing-automation`
- **The main job is deciding the feature or API itself before writing the doc** → `task-planning`, `api-design`, or the relevant planning skill first

## Instructions

### Step 1: Classify one primary mode
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

Use one primary mode per run:
- `spec` → planned change, goals, constraints, design, rollout, rollback, open questions
- `architecture` → system structure, boundaries, interfaces, trade-offs, failure modes
- `adr` → one material decision with options and rationale
- `runbook` → operate, diagnose, recover, escalate
- `migration` → move from old to new safely with validation and rollback
- `internal-guide` → implementation-facing explanation for maintainers

### Step 2: Confirm audience and route-outs
Answer three questions before writing:
1. Who will act on this document?
2. What decision or action should it enable?
3. Which neighboring skills must stay out of scope?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| Publish docs for an API, SDK, webhook, or developer portal | `api-documentation` |
| Write a tutorial, onboarding guide, or FAQ | `user-guide-writing` |
| Summarize shipped changes or maintain `CHANGELOG.md` | `changelog-maintenance` |
| Make slides for a launch, roadmap, or architecture review | `presentation-builder` |
| Write launch or product messaging | `marketing-automation` |
| Decide the API or feature design before writing docs | `api-design`, `task-planning`, or another planning skill |

### Step 3: Gather the minimum technical evidence
Do not draft from vibes alone. Pull the smallest credible evidence set first:
- current behavior or architecture notes
- interfaces, schemas, commands, or operational signals
- rollout or operational constraints
- known failure modes and recovery steps
- unresolved questions or trade-offs

If evidence is missing, label assumptions explicitly instead of pretending the document is authoritative.

### Step 4: Choose the smallest fitting structure
Use [references/mode-structures.md](references/mode-structures.md) and only keep the sections that fit the chosen mode.

### Step 5: Apply mode-specific writing rules
- **Specs** must separate goals from non-goals.
- **Architecture docs** must explain boundaries and trade-offs, not every code path.
- **ADRs** must capture one decision, not become a full design doc.
- **Runbooks** must optimize for fast action under pressure.
- **Migration guides** must foreground compatibility, validation, and rollback.
- **Internal guides** must explain implementation reality, not customer education or marketing value props.

### Step 6: Keep it docs-as-code friendly
Default to reviewable, repo-friendly writing:
- stable headings
- concise bullet lists where operators scan
- explicit commands, paths, owners, and prerequisites
- dated decisions and status for ADR-like docs
- links to source-of-truth docs instead of duplicated narrative when possible

### Step 7: Run the quality check
Before finalizing, verify:
1. The audience is named or obvious.
2. The document states what decision or action it enables.
3. Assumptions and unknowns are labeled.
4. Commands, interfaces, validation, rollback, or escalation are concrete where relevant.
5. Neighboring documentation skills are not being absorbed.
6. The title and section layout match the chosen mode.

### Step 8: Return a brief or the finished artifact
Preferred summary shape before full drafting:

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
- Route-outs kept out of scope:
```

If the user already asked for the finished artifact, produce the chosen document directly with the matching structure above.

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

### Example 4: Boundary with API docs
**Input**
> Refresh our public webhook quickstart and auth troubleshooting page for external developers.

**Good output direction**
- route to `api-documentation`
- explain that the main job is published developer-facing API docs, not internal technical documentation

## Best practices
1. Choose the document mode before writing the body.
2. Keep internal technical docs decision- and action-oriented.
3. Write only the sections the mode needs; do not force every template into every document.
4. Separate internal design / ops docs from API portals, user help, release notes, decks, and GTM copy.
5. Prefer docs-as-code structure: reviewable Markdown, stable headings, and source-linked facts.
6. Label assumptions and unresolved questions explicitly.
7. For runbooks and migrations, make rollback and escalation easy to find.
8. When the request changes audience, route out instead of stretching the internal-docs lane.

## References
- [Diátaxis](https://diataxis.fr/)
- [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)
- [Write the Docs — How to write software documentation](https://www.writethedocs.org/guide/writing/beginners-guide-to-docs/)
- [Architectural Decision Records](https://adr.github.io/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
