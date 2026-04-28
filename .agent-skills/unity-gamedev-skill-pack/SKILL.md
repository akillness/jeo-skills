---
name: unity-gamedev-skill-pack
description: >
  Evaluate and adopt Unity game-development skill packs from external repositories
  into a safe, reusable local package. Use when maintainers want to import
  game-dev workflows (Addressables, Cinemachine, GAS, VContainer, UniTask, Wwise,
  etc.) without blindly trusting third-party prompts.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repository-maintenance and skill-curation workflows where external
  Unity/Claude-Code skill packs are candidates for adaptation into internal skill
  docs, toon rules, and eval suites.
metadata:
  tags: unity, game-development, skill-curation, claude-code, repository-maintenance
  version: "1.0.0"
  source: akillness/oh-my-skills
---

# Unity GameDev Skill Pack

Use this skill to turn an external Unity skill pack into a **reviewed internal package**.

## When to use this skill
- You discovered an external Unity skill repository during survey runs.
- You want selective reuse (workflow ideas) rather than direct copy-paste.
- You need PR-safe imports with risk notes, provenance, and rollback.

## When not to use
- You need to debug a concrete Unity runtime/build error right now.
- You are writing gameplay code directly instead of curating skill docs.

## Instructions

### Step 1: Capture source provenance
Record at least one concrete source URL plus retrieval method (`indexed snippet` or `direct page retrieval`).

### Step 2: Extract reusable patterns only
From the source pack, keep transferable workflow units (setup checks, guardrails, validation order). Drop tool-locked fluff and unverifiable claims.

### Step 3: Run safety gates
Before adding any imported guidance:
- verify license suitability
- check recency/activity
- check that instructions are deterministic and non-destructive
- flag engine-version assumptions explicitly

### Step 4: Package into local skill structure
Create/update:
- `SKILL.md` (operator-facing workflow)
- `SKILL.toon` (compact behavior contract)
- `evals/evals.json` (prompt assertions that enforce boundaries)

### Step 5: Add risk + rollback in PR
State what was imported, what was intentionally excluded, known risks, and exact rollback path (revert commit/PR).

### Step 6: Validate before merge
Run JSON checks, diff hygiene (`git diff --check`), and skill validator scripts when available.

## Output format
Return a short curation packet:
- Source(s)
- Imported patterns
- Excluded patterns
- Risks
- Validation results

## Examples
- "Survey found `tjboudreaux/cc-plugin-unity-gamedev`; import only reusable setup/validation flow into local skill docs with risk notes."
- "Source license unclear after metadata fallback" -> keep as discovery evidence but do not promote/import without explicit exception rationale.

## Best practices
1. Prefer adaptation over replication: rewrite external guidance in local conventions.
2. Keep provenance labels near claims so reviewers can verify quickly.
3. Always include rollback steps in PR body when importing external workflows.

## References
- https://github.com/tjboudreaux/cc-plugin-unity-gamedev
