# Pattern Detection Modes

Use this reference when the user asks for "pattern detection" but the evidence type is unclear.

## 1. Text prefilter
Use when you need a cheap narrowing pass.

Typical evidence:
- source files
- configs
- log lines
- event payload fragments

Good outputs:
- candidate files
- repeated strings
- suspicious substrings to inspect next

Pitfalls:
- brittle regex
- misses syntax/context
- easy to overcount duplicates

## 2. Structural code rule
Use when the pattern is code-shaped and syntax matters.

Typical evidence:
- repeated call shapes
- unsafe API usage
- migration candidates
- copy-pasted branch/error patterns

Good outputs:
- rule idea in words
- grouped matches by family
- exclusions / false-positive notes

Pitfalls:
- rule too broad
- tries to solve remediation inside the same pass

## 3. Log / event pattern
Use when the signal appears across repeated logs or events.

Typical evidence:
- repeated errors
- browser/build-specific failures
- noisy retry loops
- suspicious gameplay or product events

Good outputs:
- grouped clusters
- affected environments/cohorts
- count + spread context

Pitfalls:
- parser drift
- one noisy source dominating the signal
- forgetting environment/build segmentation

## 4. Metric anomaly
Use when the pattern lives in aggregates.

Typical evidence:
- KPI spikes/drops
- funnel drop-offs
- retention anomalies
- spend / conversion swings
- economy/progression outliers

Good outputs:
- baseline vs comparison window
- absolute + relative delta
- suspicious segments
- confidence + caveats

Pitfalls:
- weak denominator context
- seasonality ignored
- instrumentation gaps mistaken for behavior change

## Quick routing rules
- Need root-cause incident reconstruction? → `log-analysis`
- Need stakeholder-ready metric explanation? → `data-analysis`
- Need ownership / call-site tracing / schema lookup? → `codebase-search`
- Need remediation or hardening plan? → `security-best-practices` or `code-review`
