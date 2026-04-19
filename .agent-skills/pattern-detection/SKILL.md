---
name: pattern-detection
description: >
  Route repeated pattern, rule, and anomaly work into one detection packet before
  suggesting tools or fixes. Use when the user needs reusable scans, suspicious
  repeated shapes, grouped outlier candidates, or first-pass anomaly triage across
  code, logs/events, telemetry, and metric tables. Choose one packet:
  text-prefilter, structural-code-rule, log-event-pattern, or metric-anomaly.
  Triggers on: repeated bug, suspicious spike, odd cohort, noisy event, code
  smell family, rule pack, anti-pattern, outlier, anomaly, fraud signal, or
  recurring issue. Route root-cause incident work to log-analysis, KPI/business
  explanation to data-analysis, repo tracing to codebase-search, remediation to
  specialist skills, and alert/incident operations to monitoring-observability.
allowed-tools: Read Grep Glob Bash
metadata:
  tags: patterns, anomalies, outliers, structural-search, telemetry, detection, routing
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
---

# Pattern Detection

## When to use this skill
- The main job is **finding repeated shapes or suspicious irregularities**, not fully explaining or fixing them yet.
- The user needs a **reusable scan**, shortlist, grouped candidate set, or anomaly triage across **code, logs/events, telemetry, or metric tables**.
- The prompt is really asking **"what patterns keep showing up?"**, **"what looks off?"**, or **"what should we inspect first?"** even if it never says "pattern detection".
- The user needs **confidence notes, false-positive risks, or the fastest validation step**, not a raw wall of hits.
- The request mentions **patterns, anomalies, outliers, repeated failures, suspicious spikes, odd cohorts, rule packs, signatures, code smells, anti-patterns, fraud signals, or recurring issue families**.

Do **not** use this skill as the main workflow when:
- The real job is **root-cause incident reconstruction** from logs or traces → `log-analysis`
- The real job is **decision-ready KPI explanation, experiment analysis, or stakeholder reporting** → `data-analysis`
- The real job is **repo tracing, ownership lookup, or metric-definition search** → `codebase-search`
- The real job is **security remediation, policy design, or vulnerability hardening** → `security-best-practices` or `code-review`
- The real job is **alert tuning, telemetry coverage, or incident operations** → `monitoring-observability`

## Core idea
`pattern-detection` should behave like a **detection packet router**, not a giant bag of regexes.

1. Normalize the prompt into **one primary detection packet**.
2. Pick the **cheapest evidence mode** that can surface trustworthy candidates.
3. Return grouped findings with **confidence and false-positive notes**.
4. Give one fastest validation step.
5. Route out aggressively once the bottleneck becomes diagnosis, explanation, remediation, or operations.

Read these support docs before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/detection-modes.md](references/detection-modes.md)
- [references/confidence-and-false-positive-checklist.md](references/confidence-and-false-positive-checklist.md)

## Instructions

### Step 1: Normalize the request
Convert the prompt into this intake shape first:

```yaml
pattern_detection_packet:
  primary_packet: text-prefilter | structural-code-rule | log-event-pattern | metric-anomaly
  evidence_shape: code | configs | logs | events | telemetry | tables | time-series | mixed | unknown
  detection_goal: repeated-shape | risky-structure | noisy-family | suspicious-spike | drift | outlier | rule-draft | shortlist
  grouping_key: file-path | symbol-shape | error-family | event-name | build-version | environment | browser-device | cohort | metric-segment | unknown
  trust_risk: broad-match | parser-drift | instrumentation-change | denominator-gap | seasonality | sample-size | none | mixed | unknown
  route_after: stay-here | log-analysis | data-analysis | codebase-search | security-best-practices | monitoring-observability | code-review
```

Choose **one** primary packet for the run. If two are plausible, pick the one that reduces uncertainty fastest.

### Step 2: Choose the packet

| Packet | Use when | Best fits | Typical outputs |
|---|---|---|---|
| `text-prefilter` | You need a cheap first pass to narrow a big scope | TODO/FIXME clusters, repeated strings, suspicious config values, broad error families | candidate files/lines, counts, and next packet suggestion |
| `structural-code-rule` | Syntax or call shape matters more than plain text | risky API usage, duplicate branching/error shapes, migration candidates, rule drafts | grouped match families, exclusions, reusable rule idea |
| `log-event-pattern` | Repeated signals show up in logs or event records | noisy retries, browser/build splits, repeated errors, suspicious event families | grouped clusters, spread/count context, likely segmentation keys |
| `metric-anomaly` | The pattern lives in aggregates or time windows | KPI spikes/drops, retention or funnel anomalies, suspicious spend or telemetry shifts | suspicious segments/windows, baseline note, confidence and caveats |

Packet rules:
- Prefer `text-prefilter` when the fastest win is to narrow the search space cheaply.
- Prefer `structural-code-rule` when plain text matching is too noisy or misses true code shape.
- Prefer `log-event-pattern` when volume, spread, parser quality, or cohort grouping matters more than single-line reading.
- Prefer `metric-anomaly` when the user cares about spikes, drift, cohorts, or time-window irregularities.

### Step 3: Narrow the evidence before claiming a pattern
Apply at least one narrowing move before interpreting results:
- limit by file/path/language scope
- limit by time window, deploy window, or experiment window
- group by one stable key: message family, event name, exception class, browser/device, build, cohort, metric segment
- separate one noisy source from a broad multi-source spread
- compare a suspicious window with a baseline window
- note whether parser, schema, or instrumentation drift could dominate the signal

Useful heuristics by packet:
- **text-prefilter** → counts + representative examples before deeper claims
- **structural-code-rule** → describe the shape in words before drafting a rule
- **log-event-pattern** → separate volume from spread and isolate cohort/environment differences
- **metric-anomaly** → include denominator, baseline, and segment context before calling something abnormal

### Step 4: Surface grouped candidates, not a raw hit list
Use this order:
1. **Candidate family** — what repeated shape or anomaly exists?
2. **Why it matters** — correctness, reliability, security, cost, UX, or player/product impact
3. **Confidence** — high / medium / low
4. **False-positive risk** — what could make it misleading?
5. **Next check** — the fastest validation or route-out

Do **not** silently turn detection into a full diagnosis, code rewrite, dashboard memo, or alert rollout.

### Step 5: Use packet-specific heuristics

#### For `text-prefilter`
- Use it only as a cheap narrowing pass.
- Capture counts and representative examples, not every hit.
- Explicitly note when syntax/context is too important for plain text alone.
- Escalate to `structural-code-rule` or `log-event-pattern` when the match quality is too noisy.

#### For `structural-code-rule`
- Describe the code shape in words before reaching for tooling.
- Group matches by family, not by file order.
- Call out likely exclusions and false positives.
- Route actual remediation or security hardening outward once the family is identified.

#### For `log-event-pattern`
- Normalize one grouping unit first: error family, event name, exception class, browser, build, region, feature flag, tenant.
- Separate repeated fallout from the likely primary family.
- Flag parser or instrumentation drift explicitly.
- Route root-cause reconstruction to `log-analysis` once the user needs the actual incident story.

#### For `metric-anomaly`
- Name baseline vs comparison window.
- Compare absolute and relative change with denominator context.
- Test whether the anomaly is broad or concentrated in one segment.
- Flag seasonality, low sample size, or instrumentation changes before implying business meaning.
- Route deeper explanation, recommendations, or experiment narration to `data-analysis`.

### Step 6: Return one compact detection brief
Default response shape:

```markdown
## Detection brief
- Packet: text-prefilter | structural-code-rule | log-event-pattern | metric-anomaly
- Scope: [files / logs / rows / metrics / time window]
- Grouping key: [file family / symbol shape / error family / cohort / segment]
- Trust level: high | medium | low

## Candidate findings
1. [pattern family or anomaly]
   - Why it matters: ...
   - Confidence: high | medium | low
   - False-positive risk: ...
   - Next check: ...
2. ...

## Route-out
- stay here | log-analysis | data-analysis | codebase-search | security-best-practices | monitoring-observability | code-review
```

Keep it compact. The point is to leave the user with the smallest trustworthy shortlist, not a giant implementation memo.

### Step 7: Route out aggressively
Switch when the next job is no longer first-pass detection:
- **Root-cause incident or outage reconstruction** → `log-analysis`
- **KPI explanation, experiment readout, or business narrative** → `data-analysis`
- **Repo tracing, ownership lookup, or metric-definition hunting** → `codebase-search`
- **Security remediation or hardening design** → `security-best-practices`
- **Judgment-heavy patch / PR review** → `code-review`
- **Alert routing, telemetry coverage, incident ops, or monitoring policy** → `monitoring-observability`

If the evidence is too thin:
1. mark confidence low
2. ask for the smallest missing anchor only if required: scope, time window, grouping key, or baseline
3. do not pretend certainty from one noisy excerpt or thin sample

## Examples

### Example 1: Repeated risky code shape
**Prompt:**
> Scan this repo for repeated risky error-handling patterns and tell me what to inspect first.

**Good response shape:**
- choose `text-prefilter` or `structural-code-rule`
- group matches by family
- include confidence and false-positive notes
- route remediation to review/refactor/security skills instead of fixing everything in place

### Example 2: KPI spike triage
**Prompt:**
> We have a KPI spike in a CSV export. Is this pattern-detection or data-analysis?

**Good response shape:**
- choose `metric-anomaly` for first-pass detection
- name baseline, denominator, and trust checks
- route explanation and recommendations to `data-analysis`

### Example 3: Gameplay telemetry outliers
**Prompt:**
> Look for suspicious gameplay telemetry outliers after yesterday's update.

**Good response shape:**
- choose `log-event-pattern` or `metric-anomaly`
- segment by build, cohort, region, or item/class
- include instrumentation caveats
- stay in detection mode instead of promising a full balance fix

### Example 4: Alert or anomaly?
**Prompt:**
> We keep getting noisy anomaly alerts on one metric; should I debug the threshold, inspect the pattern, or write a dashboard summary?

**Good response shape:**
- start with `metric-anomaly` to classify whether there is a real suspicious window or just alert noise
- call out seasonality / low-history / denominator risks
- route alert tuning to `monitoring-observability` and KPI explanation to `data-analysis`

## Best practices
1. Start with the **unit of evidence** and **grouping key**, not the tool name.
2. Use the **cheapest trustworthy packet** before escalating.
3. Always include **confidence**, **false-positive risk**, and **one next check**.
4. Group findings into **candidate families**, not raw hit lists.
5. Distinguish **detection** from **diagnosis, remediation, explanation, and alert operations**.
6. Treat parser, instrumentation, seasonality, and denominator issues as first-class caveats.
7. Prefer reusable rule thinking when the same pattern is likely to recur.

## References
- [ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md)
- [ast-grep introduction](https://ast-grep.github.io/guide/introduction.html)
- [Semgrep pattern syntax](https://semgrep.dev/docs/writing-rules/pattern-syntax)
- [CodeQL overview](https://codeql.github.com/docs/codeql-overview/about-codeql/)
- [Datadog regex/grok parsing guide](https://docs.datadoghq.com/logs/guide/regex_log_parsing/)
- [OpenSearch anomaly dashboards](https://docs.opensearch.org/latest/observing-your-data/ad/dashboards-anomaly-detection/)
- [scikit-learn outlier detection](https://scikit-learn.org/stable/modules/outlier_detection.html)
