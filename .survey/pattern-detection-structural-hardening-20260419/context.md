# Context: pattern-detection structural hardening

## Workflow Context
Repeated pattern and anomaly hunting shows up before diagnosis or reporting in four recurring lanes:
- **Code scanning / rule authoring:** teams run broad first-pass scans for repeated risky shapes, migration candidates, or reusable static-analysis rules before deeper review or remediation.
- **Log / event clustering:** operators group repeated errors, noisy retries, browser/build splits, and suspicious event families before root-cause reconstruction.
- **Metric anomaly triage:** teams identify spikes, drops, drift, and odd cohorts before stakeholder-ready analysis or alert automation.
- **Telemetry-heavy product/game analysis:** PM, LiveOps, and analytics workflows start with suspicious cohorts or event shapes, then route the explanation to a reporting or experimentation lane.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AppSec / platform engineers | Draft reusable code-pattern rules and reduce false positives in CI or review flows | Intermediate to advanced |
| Backend / SRE / on-call engineers | Group repeated log or event signatures before deeper debugging | Intermediate to advanced |
| Product / growth / data analysts | Detect suspicious KPI or cohort movement before writing a business explanation | Intermediate |
| Game analysts / LiveOps teams | Surface odd telemetry segments, build-specific spikes, or progression anomalies | Intermediate |

## Current Workarounds
1. Start with **grep / regex / shell filters** or quick repository search, then escalate only if the search is too noisy.
2. Use **ad hoc scripts, notebooks, or SQL slices** to group suspicious results when raw search output is hard to trust.
3. Lean on vendor-specific tools (Semgrep, CodeQL, Datadog, Elastic, KQL, BI tools) but still tune thresholds, group keys, and suppressions manually.
4. Switch to adjacent lanes once the job becomes root-cause triage, KPI explanation, dashboard/report building, security remediation, or alert operations.

## Adjacent Problems
- False positives from broad regex, stale thresholds, parser drift, or instrumentation changes.
- Mode mismatch: users often ask for “pattern detection” when they really need log triage, BI explanation, code search, or remediation.
- Repeated need for confidence notes, grouping keys, and one fastest validation step.
- Discovery-surface drift: compact summaries must match the routing-first boundary or the skill over-triggers.

## User Voices
- “Regularly review rule configurations as the codebase evolves and new patterns emerge. Well-tuned rules reduce false positives, build developer trust...” — Yahoo indexed snippet for Oligo static analysis guide (`https://www.oligo.security/academy/static-code-analysis`) [Yahoo indexed snippet, high]
- “Sentry can get noisy at times.” — Sentry blog on issue-alert noise (`https://blog.sentry.io/top-3-issue-alert-tips-to-stop-noisy-notifications/`) [primary source]
- Mixpanel user: “I’m having a HUGE problem with Alerts... going ’round and ’round with Support...” while trying to detect pageview anomalies by hostname (`https://community.mixpanel.com/x/questions/5avm020xlk80/struggling-with-mixpanel-alerts-seeking-help-for-a`) [primary community source]
- HN practitioner reality: “used a series of tail -f’s and unix pipes… grep, less and awk… still can’t fathom why we’re spending so much money on Splunk, DataDog” (`https://news.ycombinator.com/item?id=37600643`) [discussion-index fallback]
