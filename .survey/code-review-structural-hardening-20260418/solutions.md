# Solution Landscape: code-review structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub pull request reviews | Hosted review workflow | Native approve/request-changes flow, required reviews, review requests | Owns platform mechanics more than reviewer reasoning | Good source for decision/approval primitives |
| GitHub CODEOWNERS | Ownership/routing policy | Path-based reviewer responsibility and automatic review requests | Does not explain severity, evidence, or route-outs | Useful boundary signal, not a full review skill |
| GitLab merge-request approvals | Hosted approval workflow | Rich approval rules/status model | Approval mechanics still need reviewer judgment and evidence | Mirrors GitHub on workflow ownership |
| reviewdog | CI annotation bot | Pushes automated findings into review surfaces, integrates with existing review workflows | Best at machine-detectable findings; not a replacement for human/agent prioritization | Good reference for evidence-first automation |
| Danger JS | CI review-etiquette bot | Formalizes PR conventions, missing artifacts, and team rules after CI | Can enforce policy, but not nuanced risk judgment | Useful for meta/policy review lane |
| Current `code-review` skill | Repo-local workflow-aware review skill | Already owns correctness/risk/evidence judgment and route-outs to neighboring skills | Front door is still relatively dense and could express intake packets more compactly | Best bounded improvement target for this run |

## Categories
- **Hosted approval / ownership surfaces**: GitHub PR reviews, GitHub CODEOWNERS, GitLab approvals
- **Automation / bot assist**: reviewdog, Danger JS
- **Human/agent judgment layer**: the repo's `code-review` skill and reviewer-authored review briefs

## What People Actually Use
In practice, teams combine platform approvals with lightweight automation and still depend on humans or agents to produce the actual review judgment. Hosted platforms collect approvals and reviewer assignment. Bots enforce conventions or annotate machine-detectable findings. The missing piece is often a concise, severity-aware review brief that says whether the change is safe, what evidence is missing, and which neighboring workflow should own the next step.

## Frequency Ranking
1. Hosted PR/MR approval workflows (GitHub, GitLab)
2. Ownership/routing policy (`CODEOWNERS`, approval rules)
3. CI review automation (reviewdog, Danger)
4. Human/agent-written review briefs for nuanced risk calls

## Key Gaps
- Platform-native approval features do not provide reusable reviewer reasoning.
- Bot-based tools are strong on annotations and policy enforcement but weak on nuanced route-outs across Git, debugging, testing policy, UI review, and rollout concerns.
- Oversized review front doors invite duplication with neighboring code-quality skills.
- Discovery surfaces need tighter wording so the repo advertises `code-review` as judgment on a specific change, not as a generic "quality" or repo-admin wrapper.

## Contradictions
- Marketed review tooling often implies streamlined review, but the actual reasoning still depends on concrete evidence, missing-artifact detection, and human/agent prioritization.
- Approval rules and code ownership make routing clearer, yet they can make the review process look more complete than it really is when screenshots, migration notes, rollout evidence, or failure-path tests are missing.

## Key Insight
The strongest bounded improvement is not another code-review-adjacent wrapper. It is to tighten the existing `code-review` skill around a smaller intake contract: identify the review surface, name the risky packets/evidence present or missing, classify findings by severity, and route non-review work out immediately. That keeps the skill aligned with how hosted review platforms and CI bots are actually used while preserving clean boundaries inside the repo's code-quality cluster.
