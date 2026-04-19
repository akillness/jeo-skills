# Solution Landscape: pattern-detection structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Semgrep | structural/static rule scanning | Fast reusable code rules; CI-friendly | false positives and rule tuning overhead | Good evidence for the `structural-code-rule` lane |
| CodeQL | semantic/dataflow code analysis | Deep variant hunting and richer semantics | heavier authoring/setup cost | Better route-out when true semantic security/code analysis is needed |
| ast-grep / PMD | AST or rule-authoring tooling | Good for syntax-aware pattern families | weaker when runtime/dataflow context matters | Supports a packetized “rule idea” workflow |
| Datadog / New Relic / Dynatrace anomaly monitors | metric anomaly baselining | Good for recurring or seasonal metric shifts | noisy on sparse/new metrics; sensitivity tuning required | Fits `metric-anomaly`, not stakeholder analysis |
| Elastic / Datadog log patterns / Drain3 | log/event clustering | Groups repeated log families and noisy templates | parser/format drift hurts quality | Fits `log-event-pattern`, not RCA by itself |
| BI tools / SQL / notebooks | explanation and drilldown | Great for decision-ready summaries and richer segmentation | users fall back here after detection because dashboards or alerts are too shallow | Better route-out target than a `pattern-detection` expansion |

## Categories
- **Structural code-rule tools:** Semgrep, CodeQL, ast-grep, PMD
- **Log/event grouping tools:** Elastic log categorization, Datadog Log Patterns, Drain3
- **Metric anomaly tools:** Datadog anomaly monitors, New Relic anomaly detection, Dynatrace Davis AI, SQL/statistics libraries
- **Explanation/reporting substitutes:** BI tools, notebooks, SQL slices, dashboards

## What People Actually Use
Practitioners usually escalate through a ladder:
1. cheap grep/regex/search pass
2. grouped script or notebook / SQL slice when the first pass gets noisy
3. specialist vendor tool only if the evidence type is already clear
4. route to log triage, dashboard analysis, code review, or security remediation once the next job is no longer detection

## Frequency Ranking
1. Grep/regex + quick search
2. SQL / notebook / ad hoc scripts
3. Observability platform anomaly or log grouping features
4. Static-analysis rule engines and semantic code analysis

## Key Gaps
- Existing tools are strong at one evidence type but weak at **cross-mode intake**.
- Users still need a vendor-neutral way to choose the cheapest mode first and label false-positive risk.
- Discovery surfaces often overstate the skill as a generic “find trends” wrapper instead of a bounded first-pass detection router.

## Contradictions
- Marketed claim: anomaly tools or rule engines automate the whole problem.
- User reality: teams still tune thresholds, suppress false positives, pivot to SQL/notebooks, and switch tools when the job becomes explanation or root-cause diagnosis.

## Key Insight
The durable improvement is not another anomaly or search wrapper. It is tightening `pattern-detection` into a routing-first front door that chooses one packet (`text-prefilter`, `structural-code-rule`, `log-event-pattern`, or `metric-anomaly`), returns grouped candidates plus confidence notes, and routes diagnosis, explanation, remediation, and alert operations outward early.
