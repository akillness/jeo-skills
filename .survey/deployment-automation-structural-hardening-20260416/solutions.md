# Solution Landscape: deployment-automation structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current repo `deployment-automation` skill | Large all-in-one front door plus a few support docs | Correct repo boundary already exists; evals and references are present | Main `SKILL.md` still carries too much packet/template detail for a discovery surface | Best bounded move is to harden in place |
| Existing repo references | Split support docs for modes, checklisting, and route-outs | Good factual foundation already exists | Not yet enough to let the main skill shrink aggressively | Add or sharpen focused support packets rather than expanding the front door |
| Kubernetes Deployments docs | Canonical rollout / rollback primary source | Reinforces declarative rollout and rollback-revision framing | Not a reusable skill front door by itself | Good grounding for Kubernetes-mode reference notes |
| Argo Rollouts README | Canonical progressive delivery summary | Concise evidence for blue-green / canary / progressive delivery language | Too platform-specific to become the main skill | Supports the strategy-selection packet |
| Vercel deployment docs | Canonical preview/promotion/rollback navigation for a hosted platform | Confirms preview/promotion/rollback are distinct operator flows | Provider-specific and not sufficient for vendor-neutral routing | Use as confirmatory evidence, then route Vercel detail out |
| Adjacent repo skills (`workflow-automation`, `system-environment-setup`, `monitoring-observability`, `vercel-deploy`) | Boundary companions | Already own CI authoring, setup, telemetry, and provider-specific operations | `deployment-automation` still repeats some of their territory in the front door | Tight route-outs are more valuable than a new wrapper skill |

## Categories
- **Repo-local canonical surface**: `deployment-automation`, existing references, compact discovery file, evals
- **Primary-source rollout models**: Kubernetes Deployments docs, Argo Rollouts README
- **Provider-specific confirmatory surface**: Vercel deployments docs
- **Boundary companions**: `workflow-automation`, `system-environment-setup`, `monitoring-observability`, `vercel-deploy`

## What People Actually Use
In practice, release work clusters into a few repeated packets:
1. preview-release verification before merge,
2. staging-to-production promotion with gates,
3. managed container/PaaS rollout,
4. Kubernetes rollout strategy and stop conditions,
5. rollback response after a bad release.

The repo already knows these modes, but the main skill still embeds too much of the packet body instead of routing the user into a small decision layer and focused references.

## Frequency Ranking
1. Current repo `deployment-automation` skill — the reusable agent-facing surface that needs structural cleanup
2. Existing repo references — the right place for detailed packets, but still underused by the front door
3. Kubernetes Deployments docs — canonical rollout/rollback grounding
4. Argo Rollouts README — canonical progressive delivery grounding
5. Vercel deployments docs — confirmatory hosted-platform separation of preview/promotion/rollback
6. Adjacent repo skills — essential for route-outs, not replacements

## Key Gaps
- The main `SKILL.md` is still too long for a routing-first discovery surface.
- Packet templates and strategy detail should move farther into support references.
- `SKILL.toon` still advertises a more generic CI/CD / Docker / Kubernetes flavor than the sharper release-execution boundary.
- Evals should continue to test mode selection and route-outs after the front door is shortened.

## Contradictions
- The repo’s maintenance direction now favors small front doors plus focused references, but `deployment-automation` still behaves like a blended front door + handbook.
- The skill correctly says it is about release execution, yet the compact surface still reads like broad deployment automation rather than release routing.

## Key Insight
The right move is not another deployment wrapper and not a fresh conceptual rewrite. The right move is a structural hardening pass: keep `deployment-automation` as the release-execution anchor, shrink the main `SKILL.md` into a mode-selecting router, push packet and strategy detail into focused references, refresh the compact discovery surface, and keep route-outs to CI authoring, machine setup, observability, and provider-specific operations unmistakable.
