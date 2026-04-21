# Context: skill-standardization alias-support sync ratchet

## Workflow Context
`skill-standardization` is the repo's maintenance meta-skill for validating SKILL.md files, canonicalizing duplicates, and syncing discovery/catalog surfaces after structural rewrites. In practice, the repo has repeatedly converted overlapping skills into a canonical skill plus a narrow compatibility alias. Once aliases gained their own `references/` packets, the failure mode changed: a maintainer can update the canonical front door and the catalog surfaces, yet still leave alias-side docs advertising the old contract.

Relevant repo evidence:
- `marketing-skills-collection/SKILL.md` explicitly starts from alias-side references before opening the canonical skill, so stale alias docs can shape behavior before the canonical handoff (`.agent-skills/marketing-skills-collection/SKILL.md`).
- `frontend-design-system`, `vercel-react-best-practices`, and `remotion-video-production` all depend on lightweight alias packets instead of full duplicated instructions (`.agent-skills-wiki/log.md` lines 570-583; `.agent-skills-wiki/concepts/skill-support-coverage.md` lines 101-103).
- The graph report says support coverage is effectively complete and the best next wins are bounded front-door ratchets, not new wrappers (`graphify-out/GRAPH_REPORT.md` lines 15-18, 49-52).

External evidence:
- Agent Skills spec positions `SKILL.md` as the canonical format contract and calls out compatibility / description quality at the spec layer, but does not protect repo-local support docs from drift by itself (direct page retrieval: https://agentskills.io/specification).
- Agent Skills guidance on optimizing descriptions focuses on trigger reliability, which means repo maintainers still need an explicit manual rule for non-frontmatter alias packets (direct page retrieval: https://agentskills.io/skill-creation/optimizing-descriptions).
- Agent Skills evaluation guidance emphasizes eval-driven iteration, which supports adding a regression eval for alias-side support-sync behavior instead of relying on memory (direct page retrieval: https://agentskills.io/skill-creation/evaluating-skills).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Canonicalize duplicate skills and keep derived surfaces truthful | Advanced |
| Automation loop / cron maintainer | Apply bounded ratchets without rediscovering prior alias pitfalls | Advanced |
| Skill author | Rewrite a canonical skill without leaving misleading alias packets behind | Intermediate |

## Current Workarounds
1. Read wiki notes from earlier alias hardening runs before touching canonical-vs-alias pairs.
2. Manually inspect alias `references/` files after a canonical rewrite.
3. Rely on residue scans and reviewer memory to catch stale alias packet wording.

Limitations:
- The validator scripts do not know whether alias-side docs mirror the old contract.
- The current `skill-standardization` eval suite does not explicitly test alias-support sync expectations.
- Maintainers can pass catalog sync and still leave alias support files stale.

## Adjacent Problems
- Compact-surface freshness (`SKILL.toon`, `skills.toon`) can still drift even after a correct SKILL.md rewrite.
- README/setup discovery surfaces dominate the graph, so maintainers may over-focus on top-level docs and under-review alias support packets.
- Canonical-vs-alias work can regress if the repo encodes the rule only in wiki notes rather than in the meta-skill itself.

## User Voices
- Agent Skills specification: "The complete format specification for Agent Skills." Source: https://agentskills.io/specification
- Agent Skills description guide: "How to improve your skill's description so it triggers reliably on relevant prompts." Source: https://agentskills.io/skill-creation/optimizing-descriptions
- Agent Skills eval guide: "How to test whether your skill produces good outputs using eval-driven iteration." Source: https://agentskills.io/skill-creation/evaluating-skills
