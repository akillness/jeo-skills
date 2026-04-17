# Context: file-organization structural hardening

## Workflow Context
This lane activates when the real question is not where a file lives today, but how the repository should be shaped next: whether to keep framework defaults, introduce feature/domain folders, move to `apps/` + `packages/`, separate docs by reader task, or preserve engine-aware game/project constraints without creating a junk drawer.

The repo already made the conceptual choice on 2026-04-15: `file-organization` is the canonical repository-shape and migration skill. The remaining problem is structural. The main `SKILL.md` is still 357 lines and carries large repo-type walkthroughs, output scaffolds, and examples that duplicate what the support docs already explain. That makes the front door heavier than the repo’s current small-router + focused-reference pattern.

Cross-domain scan for this run:

| Domain | Representative skill | Current state | Why not the best target now |
|------|----------------|-------------|------------------------------|
| CLI / developer workflow | `file-organization` | 357-line high-visibility anchor with correct boundary but still oversized | **Chosen**: strongest bounded dense-anchor cleanup in the developer-workflow lane |
| Web / fullstack | `api-documentation` | still large, but its route boundary was refreshed more recently and the skill is less cross-domain than repo-shape work | Good later candidate, not the best compounding move this hour |
| Product / ops / UX | `technical-writing` / `user-guide-writing` | both remain large, but their boundaries are already clearer and less central to current repo-shape drift | Lower urgency than the shared repo-structure front door |
| Marketing / GTM / content | `marketing-automation` | not structurally drifting and below the watchlist threshold | Lower urgency this hour |
| Game development | `game-performance-profiler` | focused support already present; game cluster guidance currently says support/boundary work beats expansion | Lower structural urgency than the cross-domain repo-shape anchor |

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend / fullstack developer | Decide whether to keep framework defaults or escalate to feature/domain folders | Intermediate |
| Backend engineer | Reorganize service/module boundaries without inventing more `common/` buckets | Intermediate |
| Docs / ops maintainer | Separate tutorials, runbooks, reference, and explanation by user need | Intermediate |
| Game developer / technical designer | Keep engine-required folders while adding ownership and naming rules for assets/scripts/tools | Intermediate |
| Agent maintaining reusable skills | Route structure questions cleanly without drifting into code search, automation, environment setup, or game-production planning | Advanced |

## Current Workarounds
1. Read the oversized `SKILL.md` linearly and reconstruct the real decision ladder from a long front door.
2. Reuse the support files but still keep big repo-type walkthroughs duplicated in the main skill because the front door has not been shrunk yet.
3. Treat example folder trees as the answer instead of returning one primary organization mode plus a small boundary packet.
4. Re-open old wiki notes to remember where `file-organization` stops and `workflow-automation`, `system-environment-setup`, `codebase-search`, `design-system`, `state-management`, or `bmad-gds` begin.

## Adjacent Problems
- Repo-structure requests can drift into search if the skill does not keep "find current files" separate from "design next structure".
- Structure decisions can drift into automation/tooling if task-runner and generator setup are not routed out to `workflow-automation`.
- Docs/ops structure can become too vague if the skill does not stay grounded in a task-based taxonomy instead of a giant notes bucket.
- Game-project structure gets generic web advice unless engine-aware constraints stay explicit.
- The graph shows support coverage is complete across the repo, so the next wins come from shrinking dense anchors and syncing compact surfaces rather than adding new skills.

## User Voices
> "Learn the folder and file conventions in Next.js, and how to organize your project." — Next.js project structure docs (direct page retrieval)  
> Source: https://nextjs.org/docs/app/getting-started/project-structure

> "Diátaxis" organizes documentation around distinct content modes including tutorials and reference, reinforcing task-based documentation taxonomy instead of one mixed notes tree. — Diátaxis primary page (direct page retrieval)  
> Source: https://diataxis.fr/

> "Discover tips and best practices on how to set up your Unity project for team-based game development and version control." — Unity organizing-your-project page (direct page retrieval)  
> Source: https://unity.com/how-to/organizing-your-project

> GitHub Well-Architected maintains a distinct monorepos scenario, reinforcing that monorepo structure is an explicit architectural choice rather than a default folder tree. — direct page retrieval  
> Source: https://wellarchitected.github.com/library/scenarios/monorepos/

> "Choose and evolve project/repository structure without cargo-culting one folder tree..." — current repo skill front door  
> Source: `.agent-skills/file-organization/SKILL.md`
