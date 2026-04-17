# Strategy Selection and Stop Conditions

Use this note when the release mode is clear but the rollout strategy is not.

## Strategy chooser

| Strategy | Best fit | Preconditions | Main risk | Typical stop condition |
|---|---|---|---|---|
| Replace / direct deploy | Low-risk changes, reversible stateless services, small internal tools | Fast rollback path, low blast radius | Full-user impact if wrong | Core health check or smoke test fails immediately |
| Rolling update | Standard service upgrades with multiple instances | Readiness checks, enough capacity during rollout | Slow bleed if bad instances keep replacing good ones | Error rate or readiness failures exceed threshold |
| Blue-green | Need clean cutover and easy switchback | Duplicate environment or traffic switch | Higher cost / environment drift | New environment fails smoke checks or key KPIs |
| Canary | Want incremental exposure before full release | Traffic splitting, good telemetry, rollback discipline | False confidence from weak monitoring | Canary metrics degrade or qualitative review blocks promotion |
| Progressive delivery | Mature telemetry + staged guardrails + gradual expansion | Automated analysis or very clear checkpoints | Complexity without matching evidence discipline | Guardrail breach at any expansion stage |
| Feature-flag-assisted | Code is deployed but exposure should stay controlled | Reliable flag control and ownership | Flag state drift or hidden debt | Core flagged path fails or rollback by flag is unclear |

## Decision rules
1. Prefer the smallest strategy that matches the blast radius.
2. Do not prescribe canary or progressive delivery if telemetry and rollback are weak.
3. If the system rebuilds per environment, call out the reproducibility risk before recommending promotion.
4. If data/schema changes are irreversible, state that app rollback alone is incomplete.
5. If preview environments are the only evidence source, do not pretend they replace staging or production verification.

## Stop-condition prompts
- What exact signal should halt the rollout?
- Who can approve expansion or production promotion?
- How long should the observation window last?
- What must remain stable: availability, latency, queue depth, business KPI, or manual reviewer sign-off?
- What action happens automatically if the signal fails?

## Route-out reminders
- Need dashboards/alerts or SLO design? → `monitoring-observability`
- Need workflow YAML or release job authoring? → `workflow-automation`
- Need provider-specific Vercel behavior? → `vercel-deploy`
- Need machine/bootstrap work before rollout? → `system-environment-setup`
