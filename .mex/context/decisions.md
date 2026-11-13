---
name: decisions
description: Key architectural and technical decisions with reasoning. Load when making design choices or understanding why something is built a certain way.
triggers:
  - "why do we"
  - "why is it"
  - "decision"
  - "alternative"
  - "we chose"
edges:
  - target: context/architecture.md
    condition: when a decision relates to system structure
  - target: context/stack.md
    condition: when a decision relates to technology choice
# Decisions usually ground sparsely; add only symbols that implement the decision.
# Entry shape: { node: "function:<tier-1-id>", fingerprint: "mh2:64:<base64url>" }
grounds_to: []
last_updated: 2026-11-13
---

# Decisions

<!-- If a decision names its concrete implementation point, link it as below;
     do not anchor vague concepts:
```markdown
[`someFunction()`](mex://function:<tier-1-id>)
```
-->

<!-- HOW TO USE THIS FILE:
     Each decision follows the format below.
     When a decision changes: DO NOT delete the old entry.
     Mark it as superseded, add the new entry above it.
     The history must be preserved — this is the event clock. -->

## Decision Log

### One named-project operator instead of importing 78 coupled workflows
**Date:** 2026-11-13
**Status:** Accepted for package structure; behavioral improvement unmeasured
**Decision:** Add `donchitos-game-studios` as a guide-only operator; keep upstream project-relative scripts, hooks, references and configuration together rather than globally installing every workflow.
**Reasoning:** Source inspection found 75 canonical workflows and three deliberate compatibility aliases. Their quality scores are not independent runtime measures, and optional metadata warnings do not override catalog-only taxonomy. The evaluator rejected `claude` in the initial local name; renaming the guide preserved all gates and upstream URLs.
**Alternatives considered:** Importing all 78 folders loses project dependencies and adds competing routes; inflating the three wrappers duplicates canonical instructions. Neither is justified by the static scores.
**Consequences:** Offline preflight and package tests establish only selected-file/package properties. Keep publication incomplete and defer paid/security/paired behavioral evaluation to separately approved runs. Evidence and limits are in [the research report](../../.agent-skills/donchitos-game-studios/references/research.md) and [triage runbook](../patterns/skill-quality-triage.md).

### Shared-root-only refresh + per-host symlinks (no per-host copy installs)
**Date:** 2026-11-06
**Status:** Accepted
**Decision:** `scripts/skills-upgrade.sh` refreshes only the shared root `~/.agents/skills`; host roots (claude/pi/gjc/antigravity) stay as per-skill symlinks reconciled by `scripts/refresh-host-links.py`. Never re-run copy-based per-host installers after symlink conversion. Documented for users in README.md ("Keeping installed skills current") and README.ko.md ("설치된 스킬 최신 상태 유지"), synced to surfaces by `scripts/changelog.py`.
**Reasoning:** Copy installs create duplicate/legacy copies per host and, post-symlink, the installer rmtree can follow symlink slots into the shared root and destroy shared originals.
**Alternatives considered:** (a) per-host copy installs + a dedupe cron (rejected: repeated divergence), (b) whole-dir host symlink (rejected: hosts need non-catalog locals alongside catalog links).
**Consequences:** New skills propagate to all hosts without duplication; stale copies must be quarantined via `refresh-host-links.py --replace-copies`, not hand-deleted.

<!-- Document key decisions using the format below.
     Include decisions that: are non-obvious, have important constraints,
     or where the reasoning prevents future mistakes.
     Do not document every decision — only ones where "why" matters.
     Minimum 3 decision entries during initial population. If you cannot identify 3,
     write placeholder entries with "[TO DETERMINE]" and explain what decision is pending.

     Format for each entry:

     ### [Decision Title]
     **Date:** YYYY-MM-DD (check git history for real dates when possible)
     **Status:** Active | Superseded by [title]
     **Decision:** [What was decided, in one sentence]
     **Reasoning:** [Why this was chosen]
     **Alternatives considered:** [What else was considered and why it was rejected]
     **Consequences:** [What this means for the codebase going forward]

     Example:

     ### Use PostgreSQL for all persistent storage
     **Date:** 2024-03-01
     **Status:** Active
     **Decision:** All persistent data lives in PostgreSQL, no secondary databases.
     **Reasoning:** Simplicity — one database to operate, backup, and reason about.
     **Alternatives considered:** Redis for sessions (rejected — adds operational complexity for minimal gain), MongoDB for user preferences (rejected — relational model fits our data).
     **Consequences:** No caching layer at database level. Application-level caching if needed.

     Example of a superseded entry:

     ### Use Redis for session storage
     **Date:** 2024-02-15
     **Status:** Superseded by "Use PostgreSQL for all persistent storage"
     **Decision:** Store user sessions in Redis.
     **Reasoning:** Fast read/write for session data.
     **Alternatives considered:** PostgreSQL (chosen later due to operational simplicity).
     **Consequences:** ~~Requires Redis infrastructure alongside PostgreSQL.~~
     **Superseded because:** Maintaining two data stores added operational complexity
     without meaningful performance benefit for our scale. -->
