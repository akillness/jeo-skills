# Context: technical-writing modernization

## Workflow Context
`technical-writing` sits in the repo's documentation cluster, where users ask for specs, architecture docs, ADRs, runbooks, migration plans, and developer-facing onboarding notes. The current skill tries to cover all documentation modes at once, which makes activation noisy and causes overlap with `api-documentation` (published contract docs), `user-guide-writing` (end-user onboarding/how-to/FAQ), and `changelog-maintenance` (release-note hygiene). Graphify already records this cluster as a duplication hotspot.

A cross-domain scan was still run for this hourly loop:
- CLI / developer workflow: remaining legacy anchors include `genkit`, `fabric`, `vercel-deploy`, `deployment-automation`, and `opencontext`, but each is either broader, more tool-specific, or riskier to modernize in one bounded pass.
- Web development: `web-design-guidelines`, `technical-writing`, and `api-documentation` are still legacy-shaped, but `technical-writing` is the better bridge skill because it affects architecture/runbook/spec workflows across backend + frontend teams.
- Product / PM / UX / operations: docs quality directly affects design docs, rollout notes, runbooks, and handoffs between planning and implementation.
- Marketing / GTM / content / automation: there are broader legacy candidates (`fabric`, `video-production` pair), but the documentation cluster already has clearer graph-backed duplicate signals.
- Game development: no stronger bounded candidate surfaced this run than the documentation-cluster cleanup.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Staff / senior engineers | Write ADRs, architecture docs, migration notes, rollout docs | Advanced |
| Tech leads / PMs | Review specs and decision records before implementation | Intermediate |
| SRE / operations engineers | Maintain runbooks, incident procedures, rollback docs | Advanced |
| Developer advocates / platform engineers | Produce internal developer guides and system overviews | Intermediate |

## Current Workarounds
1. Use `technical-writing` as a catch-all and manually infer whether the request is really a spec, ADR, runbook, or migration guide.
2. Fall back to `api-documentation` even when the task is not about publishing API contracts, because the current technical-writing skill does not clearly separate internal vs external docs.
3. Reuse generic markdown templates from the current 581-line skill body instead of following a mode-specific workflow with review criteria.
4. Split work manually between `technical-writing`, `user-guide-writing`, and `changelog-maintenance` with no explicit route-out guidance.

## Adjacent Problems
- Weak trigger boundaries cause duplicate activations across the documentation cluster.
- Overlong SKILL bodies hide the core workflow and reduce discoverability.
- Missing `references/` and `evals/` make it harder to validate or reuse the skill safely.
- Internal-doc tasks often need docs-as-code, ADR capture, and runbook quality checks that are different from user-facing guides or portal docs.

## User Voices
> "Documentation as Code (Docs as Code) refers to a philosophy that you should be writing documentation with the same tools as code." — Write the Docs, Docs as Code (direct page retrieval)  
https://www.writethedocs.org/guide/docs-as-code/

> "Writing out API and design decisions allows you to formally think about them." — Write the Docs, How to write software documentation (direct page retrieval)  
https://www.writethedocs.org/guide/writing/beginners-guide-to-docs/

> "Who needs a changelog? People do." — Keep a Changelog (direct page retrieval)  
https://keepachangelog.com/en/1.1.0/

> "Tutorials How-to guides Reference Explanation" — Diátaxis navigation / structure taxonomy (direct page retrieval)  
https://diataxis.fr/
