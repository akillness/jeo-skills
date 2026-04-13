# Context: deployment-automation modernization

## Workflow Context
Deployment automation sits between repo-local build/test glue and runtime operations: package an artifact or image, target the correct environment, apply approvals/protection rules, roll out safely, verify health, and either continue promotion or roll back. The most durable skill framing is release execution and rollout automation, not generic “CI/CD” or raw Docker/Kubernetes command dumps.

Key workflow patterns repeatedly visible in primary deployment docs and practitioner writing:
1. Build or package an immutable artifact/image.
2. Promote through preview / staging / production.
3. Apply policy gates such as reviewers, wait timers, protected environments, or change windows.
4. Choose a rollout strategy: replace-in-place, rolling, blue/green, canary, progressive delivery.
5. Verify with explicit health, smoke, and rollout checks.
6. Keep an explicit rollback path and audit trail.

Sources:
- GitHub deployment controls: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- Kubernetes Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- AWS blue/green guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/blue-green-deployments/welcome.html
- Google SRE reliable launches: https://sre.google/sre-book/reliable-product-launches/
- AWS Builders’ Library safe deployments: https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application engineer | Ship new versions safely without hand-running prod steps | Mixed |
| Platform / DevOps engineer | Maintain reusable deploy paths, environment controls, and rollout templates | Advanced |
| SRE / incident responder | Limit blast radius, verify health, and recover from bad releases | Advanced |
| Security / compliance stakeholder | Require approvals, traceability, and safe credential handling | Mixed |
| Small-team technical lead | Replace “senior engineer memory” with repeatable release runbooks | Mixed |

## Current Workarounds
1. **Manual runbooks in docs/tickets** — human checklists for preflight, commands, approvals, and rollback.
2. **Imperative CI shell glue** — GitHub Actions / GitLab / Jenkins jobs call provider CLIs directly; fast to start, brittle to scale.
3. **GitOps plus human promotion conventions** — Argo CD or Flux handle reconciliation, but teams still rely on manual promotion/rollback rituals.
4. **Feature flags to decouple release from deploy** — useful, but shifts complexity into flag management.
5. **Strategy labels without full automation** — teams say “blue/green” or “canary” before encoding health criteria, promotion gates, and rollback triggers.

## Adjacent Problems
- Environment setup and auth bootstrap: adjacent, but better owned by `system-environment-setup`.
- Repo-local command glue / CI authoring: adjacent, but better owned by `workflow-automation`.
- Monitoring and ongoing telemetry: adjacent, but better owned by `monitoring-observability`.
- Secrets / IAM / compliance architecture: adjacent, but better routed to security skills.
- Schema/migration coordination: deployment must acknowledge it, but should not pretend app rollback and database rollback are the same thing.

## User Voices
- “We have found that roughly 70% of our outages are caused by changes in a live system.” — Google SRE, which is exactly why rollout safety and verification need to be first-class in the skill, not optional extras. Source: https://sre.google/sre-book/reliable-product-launches/
- AWS Builders’ Library emphasizes “safe, hands-off deployments,” which supports a runbookable, exception-focused deployment skill rather than a giant command catalog. Source: https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/
- LaunchDarkly’s dark-launch framing reinforces that users often want to separate deployment from release, not just “automate a deploy command.” Source: https://launchdarkly.com/blog/guide-to-dark-launching/
- Netflix’s canary analysis writeup shows why “watch dashboards and decide manually” does not scale as a verification model. Source: https://netflixtechblog.com/automated-canary-analysis-at-netflix-with-kayenta-3260bc7acc69

## Confidence note
Research synthesis is based on curated primary sources and prior durable practitioner material. The run’s web search/extract tools returned authentication errors, so this artifact uses direct source links rather than tool-extracted snippets.
