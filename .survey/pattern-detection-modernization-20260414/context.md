# Context: pattern-detection modernization

## Workflow Context
`pattern-detection` shows up when users need repeated rule hunting or anomaly finding across code, logs/events, or datasets — but current practice varies a lot by lane. CLI/dev teams often start with line-oriented search, then escalate to AST-aware rule tools when plain regex stops being reliable. Web/fullstack teams need grouping, segmentation, and issue-cluster detection rather than single raw matches. PM/ops/marketing analytics teams usually want KPI drift or cohort anomalies explained with baseline and trust checks. Game telemetry teams depend on event taxonomy and cohort/build segmentation before anomaly findings are actionable.

Sources:
- ripgrep guide: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
- ast-grep introduction: https://ast-grep.github.io/guide/introduction.html
- Semgrep pattern syntax: https://semgrep.dev/docs/writing-rules/pattern-syntax
- GameAnalytics Unity event tracking: https://docs.gameanalytics.com/integrations/sdk/unity/event-tracking/
- PlayFab data and analytics docs: https://learn.microsoft.com/en-us/gaming/playfab/data-analytics/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Developer / reviewer | Find repeated risky code shapes, duplicate logic, or migration candidates | Intermediate–advanced |
| Security engineer | Encode reusable detection rules with tolerable false-positive rates | Advanced |
| SRE / ops analyst | Parse logs/events and surface suspicious clusters or regressions | Intermediate–advanced |
| PM / growth / analytics lead | Explain KPI drift, anomaly spikes, cohort drops, or experiment weirdness | Intermediate |
| Game analyst / live-ops team | Detect retention, economy, crash/build, or telemetry anomalies across cohorts | Intermediate–advanced |

## Current Workarounds
1. Start with regex / grep / grok parsing because it is the cheapest first pass.
   - Datadog log parsing docs still center regex/grok workflows: https://docs.datadoghq.com/logs/guide/regex_log_parsing/
2. Escalate to structural/code-aware tools for repeated code checks.
   - ast-grep rules for find/lint/rewrite: https://ast-grep.github.io/guide/rule-config.html
   - CodeQL for variant finding and reusable code analysis: https://codeql.github.com/docs/codeql-overview/about-codeql/
3. Fall back to SQL, dashboards, CSV exports, or Sheets for business-metric anomalies.
   - Monte Carlo SQL detectors: https://www.montecarlodata.com/blog-how-to-build-your-own-data-anomaly-detectors-using-sql/
   - GA4 share/export reports: https://support.google.com/analytics/answer/9317657?hl=en
   - Looker Studio Google Sheets connector: https://docs.cloud.google.com/looker/docs/studio/connect-to-google-sheets
   - Mixpanel export methods: https://docs.mixpanel.com/docs/export-methods
4. Review anomalies through observability dashboards instead of fully automated actions.
   - OpenSearch anomaly dashboards: https://docs.opensearch.org/latest/observing-your-data/ad/dashboards-anomaly-detection/
5. In game telemetry, rely on telemetry/event instrumentation and downstream dashboard stacks before anomaly reasoning.
   - AWS GameTech on game anomalies: https://aws.amazon.com/blogs/gametech/detect-game-anomalies-amazon-lookout-for-metrics-game-analytics-pipeline/
   - Soda / 2K case study: https://soda.io/blog/2k-game-observability

## Adjacent Problems
- False positives and brittle regex rules reduce trust in repeatable scanning.
- Grouping and segmentation drift makes the same underlying issue appear as multiple separate problems.
- Data-quality/instrumentation problems can masquerade as anomalies.
- Many teams need explanation and drill-down, not just detection.
- The real job often shifts into adjacent skills: `data-analysis`, `log-analysis`, `code-review`, `security-best-practices`, or `codebase-search`.

## User Voices
> "VSCode expected search behaviour is incompatible with Ripgrep's actual behaviour."  
Source: https://github.com/BurntSushi/ripgrep/issues/2606

> "False positive using regex... blocking your adoption of Semgrep or workflow."  
Source: https://github.com/semgrep/semgrep/issues/11610

> "Same error grouped differently by browser."  
Source: https://github.com/getsentry/sentry/issues/67945

> "need alert on Percent of sessions affected by collection of issues not just 1 issue."  
Source: https://github.com/getsentry/sentry/issues/107494

> "feat(alerts): add anomaly detection based alerts"  
Source: https://github.com/PostHog/posthog/issues/50074
