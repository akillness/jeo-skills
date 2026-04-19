# Intake Packets and Route-Outs

Use this packet chooser before doing any detection work.

## Packet chooser

| Packet | Best first question | Good evidence | Route out when... |
|---|---|---|---|
| `text-prefilter` | "What is the cheapest way to narrow the scope?" | raw source files, config files, free-text logs, rough exports | syntax, grouping, or baseline quality matters more than raw text |
| `structural-code-rule` | "Is this really a code shape, not just a string?" | AST-search candidates, repeated call shapes, migration targets, risky API usage | the next job is remediation, review judgment, or semantic security analysis |
| `log-event-pattern` | "What family keeps repeating, and where does it spread?" | logs, traces exported as rows, event records, telemetry grouped by environment/build/cohort | the next job is root-cause incident reconstruction or alert operations |
| `metric-anomaly` | "Is there a real suspicious window or segment here?" | KPI tables, retention/funnel outputs, telemetry metrics, time-series summaries | the next job is business explanation, dashboard/reporting, or monitor tuning |

## Minimal intake prompts
- **Scope:** files, services, routes, cohorts, environments, builds, time window
- **Grouping key:** symbol shape, message family, event name, browser/device, cohort, metric segment
- **Decision after detection:** investigate root cause, create a rule, explain KPI movement, harden security, or tune monitoring

## Fast route-outs
- Need the actual outage or incident story? → `log-analysis`
- Need KPI explanation, recommendations, or experiment readout? → `data-analysis`
- Need call-site tracing or metric-definition lookup? → `codebase-search`
- Need remediation or hardening design? → `security-best-practices` or `code-review`
- Need alert thresholds, telemetry coverage, or incident operations? → `monitoring-observability`

## Portable output rule
Every packet should end with:
1. grouped candidate findings
2. confidence and false-positive risk
3. one fastest validation step
4. one route-out if the bottleneck moved
