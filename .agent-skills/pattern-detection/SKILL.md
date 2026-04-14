---
name: pattern-detection
description: >
  Hunt for repeated rules, suspicious shapes, and anomalies across code, logs,
  telemetry, and structured datasets. Use when the user wants reusable pattern
  scans, outlier triage, or recurring-issue detection — even if they ask in
  domain language like smell, anti-pattern, suspicious spike, repeated bug,
  odd cohort, noisy event, fraud signal, duplicate shape, or anomaly. Choose
  the right mode (text prefilter, structural code rule, log/event pattern, or
  metric anomaly), label confidence and false-positive risk, and route deep log
  forensics, stakeholder analysis, or full security remediation to adjacent
  specialist skills.
allowed-tools: Read Grep Glob Bash
metadata:
  tags: patterns, anomalies, outliers, structural-search, telemetry, detection
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Pattern Detection

## When to use this skill
- The user needs to **find recurring shapes or suspicious repeats**, not just inspect one isolated incident.
- The task is to **scan code for repeatable risky structures**, migration candidates, duplicate logic, or reusable query/rule ideas.
- The task is to **spot anomalies in logs, telemetry, or tabular data** before deeper diagnosis or reporting.
- The user wants a **detection workflow with confidence notes and false-positive handling**, not a pile of raw regex snippets.
- The request mentions **patterns, anomalies, outliers, repeated failures, suspicious spikes, odd cohorts, rule packs, signatures, code smells, or recurring event shapes**.

Do **not** use this skill as the main workflow when:
- The real job is **root-cause log triage** for a concrete incident → use `log-analysis`.
- The real job is **decision-ready dataset explanation, KPI storytelling, experiment analysis, or stakeholder reporting** → use `data-analysis`.
- The real job is **repo navigation / call-site tracing / metric-definition lookup** → use `codebase-search`.
- The real job is **security hardening, policy design, or full vulnerability remediation** → use `security-best-practices` or `code-review`.

## Core idea
Pattern detection is a **mode-selection problem** before it is a tooling problem.

Use the cheapest reliable detection mode that matches the unit of evidence:
1. **Text prefilter** — fast grep/regex/glob pass to narrow the search space
2. **Structural code rule** — AST/query/pattern rule when text matching becomes brittle
3. **Log / event pattern** — repeated error shape, noisy event cluster, parser-aware field checks
4. **Metric anomaly** — outlier, spike, drift, cohort irregularity, seasonal deviation

The skill succeeds when it surfaces a **small set of explainable candidates** with confidence, false-positive risk, and the next handoff.

## Instructions

### Step 1: Frame the detection job
Before scanning, define:
- **Object of detection** — code blocks, log lines, event records, rows, metrics, cohorts, sessions, builds
- **Pattern type** — repeated structure, forbidden shape, anomaly, outlier, drift, cluster, signature
- **Why it matters** — correctness, security, reliability, cost, player experience, growth, fraud, migration effort
- **Expected output** — ranked candidates, counts, suspicious segments, reusable rule draft, or triage shortlist
- **Acceptance threshold** — what would count as interesting enough to escalate?

Restate the task in one line:
> "We need to detect [pattern/anomaly] across [scope] so we can [decision/action]."

### Step 2: Run a trust and scope check
Always inspect the evidence source before claiming a pattern.

#### Minimum checks
- coverage of files / logs / rows / time window
- whether the data is complete enough for comparison
- schema or field availability
- obvious parser / instrumentation issues
- sample size or count context
- whether seasonality, deploy timing, or environment split could explain the signal

If trust is low, switch the deliverable from **pattern found** to **candidate signal with caveats**.

### Step 3: Choose the right detection mode

| Mode | Use when | Typical evidence | Good tools / tactics | Output |
|---|---|---|---|---|
| Text prefilter | You need a cheap first pass | source files, configs, logs | grep / ripgrep / globs / regex | shortlist of files or lines worth deeper inspection |
| Structural code rule | The pattern is code-shaped and syntax matters | functions, AST nodes, call shapes, API misuse | AST-aware search, code-query rules, structured search | reusable rule idea + prioritized matches |
| Log / event pattern | The issue is repeated across logs, traces, or events | error lines, event names, payload fields, browser/build splits | parsing, field grouping, regex where appropriate, windowing | grouped suspicious clusters with counts and context |
| Metric anomaly | The signal is in rates, volumes, cohorts, or time series | KPI tables, retention, funnels, spend, telemetry metrics | SQL/statistics/notebook checks, rolling baselines, segmentation | suspicious segments or windows with confidence notes |

If more than one mode is needed, use them in order:
1. prefilter
2. structured/grouped detection
3. quantify the suspicious subset

### Step 4: Apply the mode-specific workflow

#### Mode A — Text prefilter
Use for broad narrowing only.

Checklist:
1. define file/time/path scope
2. search for the cheapest candidate signature first
3. capture counts and representative examples
4. note why text matching may over-match or under-match
5. escalate if syntax or field structure matters

Good use cases:
- repeated error string families
- TODO/FIXME/HACK clusters
- suspicious hard-coded values or feature flags
- initial narrowing before AST or parser-aware work

#### Mode B — Structural code rule
Use when plain text matching is too noisy.

Checklist:
1. describe the code shape in words before writing any rule
2. identify the required structure and allowed variants
3. note likely false positives and safe exclusions
4. group matches by pattern family, not just raw file list
5. decide whether the next step is review, refactor, or security escalation

Good use cases:
- repeated unsafe call shapes
- duplicate branching/error-handling structures
- legacy API migration candidates
- anti-pattern families that need a reusable rule

#### Mode C — Log / event pattern
Use when repeated signals show up in logs or telemetry records.

Checklist:
1. normalize the unit of grouping (message family, event name, exception class, browser, build, region, feature flag)
2. separate volume from spread (one noisy source vs many sources)
3. compare across environments / cohorts / time windows
4. flag parser or instrumentation drift explicitly
5. hand off root-cause reconstruction to `log-analysis` if the task becomes incident diagnosis

Good use cases:
- repeated browser/version crash signatures
- noisy retry/error families
- suspicious event spam after a release
- gameplay telemetry clusters by build or player segment

#### Mode D — Metric anomaly
Use when the pattern is in aggregates rather than raw lines.

Checklist:
1. define baseline and comparison window
2. compare absolute change, relative change, and denominator context
3. segment by the strongest likely drivers
4. test whether the anomaly is broad or concentrated
5. distinguish data-quality issues from genuine behavior change
6. hand off deeper explanation and recommendation writing to `data-analysis` if needed

Good use cases:
- KPI spikes/drops
- retention or funnel anomalies
- suspicious spend / conversion swings
- telemetry economy or progression outliers

### Step 5: Label confidence and false-positive risk
For every finding, include:
- **Confidence:** high / medium / low
- **Why:** evidence quality, sample size, structural specificity, or consistency across segments
- **False-positive risk:** what could make this signal misleading?
- **Next best check:** the fastest way to validate or falsify the finding

Default heuristics:
- **High confidence** — repeated signal, good coverage, strong grouping/structure, low ambiguity
- **Medium confidence** — plausible signal but one major caveat remains
- **Low confidence** — thin data, broad regex, weak baseline, or likely parser/instrumentation drift

### Step 6: Keep detection separate from remediation
Return three layers:
1. **Detected pattern / anomaly** — what repeated shape or irregularity you found
2. **Why it is interesting** — risk, cost, severity, or likely impact
3. **What should happen next** — validate, inspect, route to another skill, or promote to a reusable rule

Do **not** silently turn detection into a full diagnosis, code rewrite, or stakeholder memo.

### Step 7: Route out when another job starts
Hand off when detection is no longer the bottleneck:
- **Root-cause incident reconstruction** → `log-analysis`
- **Stakeholder-ready KPI explanation / experiments / business narrative** → `data-analysis`
- **Repo tracing / ownership / instrumentation lookup** → `codebase-search`
- **Security hardening or remediation plan** → `security-best-practices`
- **Judgment-heavy review of a concrete diff or patch** → `code-review`

## Examples

### Example 1: Repeated risky code shape
**Prompt:**
> Scan this repo for repeated risky error-handling patterns and tell me what to inspect first.

**Good response shape:**
- choose text prefilter + structural code rule
- group matches by pattern family
- explain likely false positives
- recommend review or refactor handoff, not automatic remediation

### Example 2: KPI spike triage
**Prompt:**
> We have a KPI spike in a CSV export. Is this pattern-detection or data-analysis?

**Good response shape:**
- use metric anomaly mode for first-pass detection
- check baseline, coverage, and denominator context
- if the user needs explanation/recommendations, route to `data-analysis`

### Example 3: Gameplay telemetry outliers
**Prompt:**
> Look for suspicious gameplay telemetry outliers after yesterday's update.

**Good response shape:**
- choose log/event or metric anomaly mode depending on the data
- segment by build, player cohort, region, or item/class
- call out instrumentation caveats and follow-up validation

### Example 4: Reusable rule hunting
**Prompt:**
> I need reusable rules for finding unsafe code shapes, not a full security audit.

**Good response shape:**
- define the unsafe structure in words first
- propose a structural rule direction
- report likely match families and false-positive controls
- route remediation to `security-best-practices` only if the user wants the hardening plan

## Best practices
1. Start with the **unit of evidence** (code shape, log family, metric series), not the tool name.
2. Use the **cheapest reliable mode** before escalating to heavier analysis.
3. Always include **confidence and false-positive risk**.
4. Group findings into **pattern families**, not just raw hit lists.
5. Distinguish **detection** from **diagnosis, remediation, and reporting**.
6. Treat parser, instrumentation, and baseline problems as first-class caveats.
7. Prefer reusable rule thinking when the same pattern is likely to recur.

## References
- [ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md)
- [ast-grep introduction](https://ast-grep.github.io/guide/introduction.html)
- [Semgrep pattern syntax](https://semgrep.dev/docs/writing-rules/pattern-syntax)
- [CodeQL overview](https://codeql.github.com/docs/codeql-overview/about-codeql/)
- [Datadog regex/grok parsing guide](https://docs.datadoghq.com/logs/guide/regex_log_parsing/)
- [OpenSearch anomaly dashboards](https://docs.opensearch.org/latest/observing-your-data/ad/dashboards-anomaly-detection/)
- [scikit-learn outlier detection](https://scikit-learn.org/stable/modules/outlier_detection.html)

## Output format
Use a concise detection brief:

```markdown
## Detection brief
- Goal: [pattern/anomaly to detect]
- Scope: [files / logs / rows / metrics / time window]
- Mode used: text prefilter | structural code rule | log/event pattern | metric anomaly
- Trust level: high | medium | low

## Candidate findings
1. [pattern family or anomaly] — confidence: high/medium/low
2. [pattern family or anomaly] — confidence: high/medium/low

## False-positive risks
- [risk]
- [risk]

## Next checks / handoff
- [validate / inspect / route to adjacent skill]
```
